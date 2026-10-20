// SSH/SFTP engine for the Portable Web App Suite, compiled to WebAssembly (GOOS=js GOARCH=wasm).
//
// The engine does not open network connections itself. The page passes a transport object
// (normally a relay connection from shared/js/relay.js) with
//
//	send(Uint8Array), read(): Promise<Uint8Array|null>, close()
//
// so SSH is encrypted end to end between the browser and the server; the relay only forwards bytes.
//
// JavaScript API (global SSHEngine):
//
//	SSHEngine.connect(transport, {user, password, privateKey, passphrase, hostKey, ciphers}) -> Promise<client>
//	    ciphers optionally restricts/orders the ciphers (e.g. ["aes128-gcm@openssh.com"]).
//	    hostKey(info) is called with {type, fingerprint (SHA256:...), key (base64)} and must resolve to
//	    true to accept the server key.
//	client.exec(command) -> Promise<{stdout: Uint8Array, stderr: Uint8Array, code}>
//	client.shell({term, cols, rows, onData(Uint8Array), onExit(code)}) -> Promise<shell>
//	    shell.write(Uint8Array|string), shell.resize(cols, rows), shell.close()
//	client.sftp() -> Promise<sftp>
//	    sftp.list(path) -> [{name, size, mode, isDir, mtime}], sftp.stat(path), sftp.realpath(path),
//	    sftp.readFile(path) -> Uint8Array, sftp.writeFile(path, Uint8Array), sftp.mkdir(path),
//	    sftp.readAt(path, offset, length) -> Uint8Array, sftp.writeAt(path, offset, Uint8Array, truncate),
//	    sftp.chtimes(path, mtimeMs), sftp.remove(path), sftp.rmdir(path), sftp.rename(from, to), sftp.close()
//	client.close()
//	SSHEngine.generateKey(type, comment, passphrase) -> Promise<{privateKey (OpenSSH PEM), publicKey (authorized_keys line),
//	    fingerprint, type}>; type "ed25519" (default), "ecdsa" (P-256) or "rsa" (4096 bits)
package main

import (
	"bytes"
	"crypto"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"sync"
	"syscall/js"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

const version = "0.3.0"

// ---- promises and helpers --------------------------------------------------------------------

func jsError(err error) js.Value {
	return js.Global().Get("Error").New(err.Error())
}

// promise runs fn in a goroutine (JS callbacks must never block) and returns a JS Promise.
func promise(fn func() (any, error)) js.Value {
	var handler js.Func
	handler = js.FuncOf(func(this js.Value, args []js.Value) any {
		resolve, reject := args[0], args[1]
		go func() {
			defer func() {
				if r := recover(); r != nil {
					reject.Invoke(jsError(fmt.Errorf("internal error: %v", r)))
				}
			}()
			v, err := fn()
			if err != nil {
				reject.Invoke(jsError(err))
			} else {
				resolve.Invoke(v)
			}
		}()
		return nil
	})
	p := js.Global().Get("Promise").New(handler)
	handler.Release()
	return p
}

// await blocks the calling goroutine until the JS promise settles.
func await(p js.Value) (js.Value, error) {
	type result struct {
		v   js.Value
		err error
	}
	ch := make(chan result, 1)
	var then, catch js.Func
	then = js.FuncOf(func(this js.Value, args []js.Value) any {
		v := js.Undefined()
		if len(args) > 0 {
			v = args[0]
		}
		ch <- result{v: v}
		return nil
	})
	catch = js.FuncOf(func(this js.Value, args []js.Value) any {
		msg := "promise rejected"
		if len(args) > 0 && args[0].Truthy() {
			if m := args[0].Get("message"); m.Type() == js.TypeString {
				msg = m.String()
			} else {
				msg = args[0].Call("toString").String()
			}
		}
		ch <- result{err: errors.New(msg)}
		return nil
	})
	p.Call("then", then, catch)
	r := <-ch
	then.Release()
	catch.Release()
	return r.v, r.err
}

func toJSBytes(b []byte) js.Value {
	arr := js.Global().Get("Uint8Array").New(len(b))
	js.CopyBytesToJS(arr, b)
	return arr
}

func fromJSBytes(v js.Value) []byte {
	if v.Type() == js.TypeString {
		return []byte(v.String())
	}
	b := make([]byte, v.Get("length").Int())
	js.CopyBytesToGo(b, v)
	return b
}

func str(opts js.Value, name string) string {
	if v := opts.Get(name); v.Type() == js.TypeString {
		return v.String()
	}
	return ""
}

func num(opts js.Value, name string, def int) int {
	if v := opts.Get(name); v.Type() == js.TypeNumber {
		return v.Int()
	}
	return def
}

// object builds a JS object from Go functions; release() frees all of them.
type object struct {
	value js.Value
	funcs []js.Func
}

func newObject() *object { return &object{value: js.Global().Get("Object").New()} }

func (o *object) method(name string, fn func(args []js.Value) any) {
	f := js.FuncOf(func(this js.Value, args []js.Value) any { return fn(args) })
	o.funcs = append(o.funcs, f)
	o.value.Set(name, f)
}

func (o *object) release() {
	for _, f := range o.funcs {
		f.Release()
	}
	o.funcs = nil
}

// ---- transport: net.Conn over the JS transport object ------------------------------------------

type jsConn struct {
	transport js.Value
	pending   []byte
	closeOnce sync.Once
	closed    bool
}

func (c *jsConn) Read(p []byte) (int, error) {
	if len(c.pending) == 0 {
		if c.closed {
			return 0, io.EOF
		}
		v, err := await(c.transport.Call("read"))
		if err != nil {
			return 0, err
		}
		if v.IsNull() || v.IsUndefined() {
			c.closed = true
			return 0, io.EOF
		}
		c.pending = fromJSBytes(v)
	}
	n := copy(p, c.pending)
	c.pending = c.pending[n:]
	return n, nil
}

func (c *jsConn) Write(p []byte) (int, error) {
	if c.closed {
		return 0, net.ErrClosed
	}
	c.transport.Call("send", toJSBytes(p))
	return len(p), nil
}

func (c *jsConn) Close() error {
	c.closeOnce.Do(func() {
		c.closed = true
		c.transport.Call("close")
	})
	return nil
}

type jsAddr struct{}

func (jsAddr) Network() string { return "relay" }
func (jsAddr) String() string  { return "relay" }

func (c *jsConn) LocalAddr() net.Addr                { return jsAddr{} }
func (c *jsConn) RemoteAddr() net.Addr               { return jsAddr{} }
func (c *jsConn) SetDeadline(t time.Time) error      { return nil }
func (c *jsConn) SetReadDeadline(t time.Time) error  { return nil }
func (c *jsConn) SetWriteDeadline(t time.Time) error { return nil }

// ---- connect -----------------------------------------------------------------------------------

func connect(transport, opts js.Value) (any, error) {
	user := str(opts, "user")
	var auth []ssh.AuthMethod
	if key := str(opts, "privateKey"); key != "" {
		var signer ssh.Signer
		var err error
		if pass := str(opts, "passphrase"); pass != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(key), []byte(pass))
		} else {
			signer, err = ssh.ParsePrivateKey([]byte(key))
		}
		if err != nil {
			return nil, fmt.Errorf("private key: %w", err)
		}
		auth = append(auth, ssh.PublicKeys(signer))
	}
	if pass := str(opts, "password"); pass != "" {
		auth = append(auth, ssh.Password(pass))
		auth = append(auth, ssh.KeyboardInteractive(func(name, instruction string, questions []string, echos []bool) ([]string, error) {
			answers := make([]string, len(questions))
			for i := range answers {
				answers[i] = pass
			}
			return answers, nil
		}))
	}
	hostKeyFn := opts.Get("hostKey")
	config := &ssh.ClientConfig{
		User: user,
		Auth: auth,
		HostKeyCallback: func(hostname string, remote net.Addr, key ssh.PublicKey) error {
			if hostKeyFn.Type() != js.TypeFunction {
				return errors.New("no hostKey callback given")
			}
			info := js.Global().Get("Object").New()
			info.Set("type", key.Type())
			info.Set("fingerprint", ssh.FingerprintSHA256(key))
			info.Set("key", base64.StdEncoding.EncodeToString(key.Marshal()))
			answer := hostKeyFn.Invoke(info)
			if answer.InstanceOf(js.Global().Get("Promise")) {
				var err error
				if answer, err = await(answer); err != nil {
					return err
				}
			}
			if !answer.Truthy() {
				return errors.New("host key rejected")
			}
			return nil
		},
		Timeout: 30 * time.Second,
	}
	// WebAssembly has no AES instructions: ChaCha20-Poly1305 is about 3x faster than AES-GCM here.
	config.Ciphers = []string{"chacha20-poly1305@openssh.com", "aes128-gcm@openssh.com", "aes256-gcm@openssh.com",
		"aes128-ctr", "aes192-ctr", "aes256-ctr"}
	if ciphers := opts.Get("ciphers"); ciphers.Type() == js.TypeObject {
		config.Ciphers = nil
		for i := 0; i < ciphers.Length(); i++ {
			config.Ciphers = append(config.Ciphers, ciphers.Index(i).String())
		}
	}
	conn := &jsConn{transport: transport}
	c, chans, reqs, err := ssh.NewClientConn(conn, "relay", config)
	if err != nil {
		conn.Close()
		return nil, err
	}
	return newClient(ssh.NewClient(c, chans, reqs)), nil
}

func newClient(client *ssh.Client) js.Value {
	o := newObject()
	o.value.Set("serverVersion", string(client.ServerVersion()))
	o.method("exec", func(args []js.Value) any {
		command := args[0].String()
		return promise(func() (any, error) {
			session, err := client.NewSession()
			if err != nil {
				return nil, err
			}
			defer session.Close()
			var stdout, stderr bytes.Buffer
			session.Stdout, session.Stderr = &stdout, &stderr
			code := 0
			if err := session.Run(command); err != nil {
				var exit *ssh.ExitError
				if !errors.As(err, &exit) {
					return nil, err
				}
				code = exit.ExitStatus()
			}
			result := js.Global().Get("Object").New()
			result.Set("stdout", toJSBytes(stdout.Bytes()))
			result.Set("stderr", toJSBytes(stderr.Bytes()))
			result.Set("code", code)
			return result, nil
		})
	})
	o.method("shell", func(args []js.Value) any {
		opts := js.Global().Get("Object").New()
		if len(args) > 0 && args[0].Type() == js.TypeObject {
			opts = args[0]
		}
		return promise(func() (any, error) { return newShell(client, opts) })
	})
	o.method("sftp", func(args []js.Value) any {
		return promise(func() (any, error) {
			s, err := sftp.NewClient(client)
			if err != nil {
				return nil, err
			}
			return newSFTP(s), nil
		})
	})
	o.method("close", func(args []js.Value) any {
		client.Close()
		o.release()
		return nil
	})
	return o.value
}

// ---- interactive shell -------------------------------------------------------------------------

func newShell(client *ssh.Client, opts js.Value) (any, error) {
	session, err := client.NewSession()
	if err != nil {
		return nil, err
	}
	term := str(opts, "term")
	if term == "" {
		term = "xterm-256color"
	}
	modes := ssh.TerminalModes{ssh.ECHO: 1, ssh.TTY_OP_ISPEED: 115200, ssh.TTY_OP_OSPEED: 115200}
	if err := session.RequestPty(term, num(opts, "rows", 24), num(opts, "cols", 80), modes); err != nil {
		session.Close()
		return nil, err
	}
	stdin, err := session.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := session.StderrPipe()
	if err != nil {
		return nil, err
	}
	if err := session.Shell(); err != nil {
		session.Close()
		return nil, err
	}
	onData, onExit := opts.Get("onData"), opts.Get("onExit")
	pump := func(r io.Reader) {
		buf := make([]byte, 32*1024)
		for {
			n, err := r.Read(buf)
			if n > 0 && onData.Type() == js.TypeFunction {
				onData.Invoke(toJSBytes(buf[:n]))
			}
			if err != nil {
				return
			}
		}
	}
	go pump(stdout)
	go pump(stderr)
	o := newObject()
	go func() {
		code := 0
		if err := session.Wait(); err != nil {
			var exit *ssh.ExitError
			if errors.As(err, &exit) {
				code = exit.ExitStatus()
			} else {
				code = -1
			}
		}
		if onExit.Type() == js.TypeFunction {
			onExit.Invoke(code)
		}
		o.release()
	}()
	o.method("write", func(args []js.Value) any {
		data := fromJSBytes(args[0])
		go stdin.Write(data)
		return nil
	})
	o.method("resize", func(args []js.Value) any {
		cols, rows := args[0].Int(), args[1].Int()
		go session.WindowChange(rows, cols)
		return nil
	})
	o.method("close", func(args []js.Value) any {
		go session.Close()
		return nil
	})
	return o.value, nil
}

// ---- SFTP --------------------------------------------------------------------------------------

func fileInfo(name string, fi os.FileInfo) js.Value {
	v := js.Global().Get("Object").New()
	v.Set("name", name)
	v.Set("size", float64(fi.Size()))
	v.Set("mode", uint32(fi.Mode()))
	v.Set("modeString", fi.Mode().String())
	v.Set("isDir", fi.IsDir())
	v.Set("mtime", float64(fi.ModTime().UnixMilli()))
	return v
}

func newSFTP(s *sftp.Client) js.Value {
	o := newObject()
	path := func(args []js.Value, i int) string { return args[i].String() }
	o.method("list", func(args []js.Value) any {
		p := path(args, 0)
		return promise(func() (any, error) {
			entries, err := s.ReadDir(p)
			if err != nil {
				return nil, err
			}
			list := js.Global().Get("Array").New()
			for _, e := range entries {
				list.Call("push", fileInfo(e.Name(), e))
			}
			return list, nil
		})
	})
	o.method("stat", func(args []js.Value) any {
		p := path(args, 0)
		return promise(func() (any, error) {
			fi, err := s.Stat(p)
			if err != nil {
				return nil, err
			}
			return fileInfo(fi.Name(), fi), nil
		})
	})
	o.method("realpath", func(args []js.Value) any {
		p := path(args, 0)
		return promise(func() (any, error) { return s.RealPath(p) })
	})
	o.method("readFile", func(args []js.Value) any {
		p := path(args, 0)
		return promise(func() (any, error) {
			f, err := s.Open(p)
			if err != nil {
				return nil, err
			}
			defer f.Close()
			var buf bytes.Buffer
			if _, err := f.WriteTo(&buf); err != nil {
				return nil, err
			}
			return toJSBytes(buf.Bytes()), nil
		})
	})
	o.method("writeFile", func(args []js.Value) any {
		p, data := path(args, 0), fromJSBytes(args[1])
		return promise(func() (any, error) {
			f, err := s.Create(p)
			if err != nil {
				return nil, err
			}
			if _, err := f.ReadFrom(bytes.NewReader(data)); err != nil {
				f.Close()
				return nil, err
			}
			return nil, f.Close()
		})
	})
	// readAt(path, offset, length): up to length bytes from offset (fewer at the end of the file); used for chunked
	// downloads with progress and for resuming them
	o.method("readAt", func(args []js.Value) any {
		p, offset, length := path(args, 0), int64(args[1].Float()), args[2].Int()
		return promise(func() (any, error) {
			f, err := s.Open(p)
			if err != nil {
				return nil, err
			}
			defer f.Close()
			buf := make([]byte, length)
			n, err := f.ReadAt(buf, offset)
			if err != nil && err != io.EOF {
				return nil, err
			}
			return toJSBytes(buf[:n]), nil
		})
	})
	// writeAt(path, offset, data, truncate): writes data at offset (creating the file; truncate empties it first)
	o.method("writeAt", func(args []js.Value) any {
		p, offset, data, truncate := path(args, 0), int64(args[1].Float()), fromJSBytes(args[2]), args[3].Truthy()
		return promise(func() (any, error) {
			flags := os.O_WRONLY | os.O_CREATE
			if truncate {
				flags |= os.O_TRUNC
			}
			f, err := s.OpenFile(p, flags)
			if err != nil {
				return nil, err
			}
			if _, err := f.WriteAt(data, offset); err != nil {
				f.Close()
				return nil, err
			}
			return nil, f.Close()
		})
	})
	simple := func(name string, fn func(args []js.Value) error) {
		o.method(name, func(args []js.Value) any {
			return promise(func() (any, error) { return nil, fn(args) })
		})
	}
	simple("mkdir", func(args []js.Value) error { return s.Mkdir(path(args, 0)) })
	simple("remove", func(args []js.Value) error { return s.Remove(path(args, 0)) })
	simple("rmdir", func(args []js.Value) error { return s.RemoveDirectory(path(args, 0)) })
	simple("rename", func(args []js.Value) error { return s.PosixRename(path(args, 0), path(args, 1)) })
	simple("chtimes", func(args []js.Value) error {
		t := time.UnixMilli(int64(args[1].Float()))
		return s.Chtimes(path(args, 0), t, t)
	})
	o.method("close", func(args []js.Value) any {
		s.Close()
		o.release()
		return nil
	})
	return o.value
}

// generateKey creates a key pair: kind "ed25519" (default), "ecdsa" (P-256) or "rsa" (4096 bits). The private key is
// returned in the OpenSSH format (encrypted when a passphrase is given), the public key as an authorized_keys line.
func generateKey(kind, comment, passphrase string) (any, error) {
	var private crypto.PrivateKey
	var public crypto.PublicKey
	switch kind {
	case "rsa":
		k, err := rsa.GenerateKey(rand.Reader, 4096)
		if err != nil {
			return nil, err
		}
		private, public = k, &k.PublicKey
	case "ecdsa":
		k, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		if err != nil {
			return nil, err
		}
		private, public = k, &k.PublicKey
	default:
		pub, k, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			return nil, err
		}
		private, public = k, pub
	}
	var block *pem.Block
	var err error
	if passphrase != "" {
		block, err = ssh.MarshalPrivateKeyWithPassphrase(private, comment, []byte(passphrase))
	} else {
		block, err = ssh.MarshalPrivateKey(private, comment)
	}
	if err != nil {
		return nil, err
	}
	sshPub, err := ssh.NewPublicKey(public)
	if err != nil {
		return nil, err
	}
	line := bytes.TrimSpace(ssh.MarshalAuthorizedKey(sshPub))
	if comment != "" {
		line = append(append(line, ' '), comment...)
	}
	result := js.Global().Get("Object").New()
	result.Set("privateKey", string(pem.EncodeToMemory(block)))
	result.Set("publicKey", string(line)+"\n")
	result.Set("fingerprint", ssh.FingerprintSHA256(sshPub))
	result.Set("type", sshPub.Type())
	return result, nil
}

func main() {
	engine := newObject()
	engine.method("generateKey", func(args []js.Value) any {
		kind, comment, passphrase := args[0].String(), args[1].String(), args[2].String()
		return promise(func() (any, error) { return generateKey(kind, comment, passphrase) })
	})
	engine.value.Set("version", version)
	engine.method("connect", func(args []js.Value) any {
		transport, opts := args[0], args[1]
		return promise(func() (any, error) { return connect(transport, opts) })
	})
	js.Global().Set("SSHEngine", engine.value)
	if ready := js.Global().Get("onSSHEngineReady"); ready.Type() == js.TypeFunction {
		ready.Invoke(engine.value)
	}
	select {}
}
