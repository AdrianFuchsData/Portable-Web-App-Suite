<#
.SYNOPSIS
    Portable Web App Suite relay (PowerShell implementation).

.DESCRIPTION
    Lets the browser apps reach TCP services (IMAP, SMTP, SSH, SFTP, FTP, Postgres, ...) through
    WebSockets, and HTTP services without CORS restrictions. Implements the same protocol (version 2)
    as relay/python/relay.py; see there and relay/README.md for the protocol and the security rules.

    Runs with Windows PowerShell 5.1 and PowerShell 7 (Windows, Linux, macOS) without modules,
    without Add-Type/C# compilation and without admin rights: it uses a plain TcpListener (no
    HttpListener, so no URL ACL reservation is needed) and implements the WebSocket handshake and
    framing itself. It does not work in Constrained Language Mode.

    By default it listens on 127.0.0.1 with a random token. It can also run on another machine
    (-Bind, -TlsCert) or behind a reverse proxy (-TrustedProxy, -BasePath), with user accounts
    (-Users; create them with -AddUser) instead of or in addition to the token.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File relay.ps1
    pwsh -File relay.ps1 -Port 8765 -Allow '*.example.org:993'
    pwsh -File relay.ps1 -Users users.json -AddUser anna
    pwsh -File relay.ps1 -Bind 0.0.0.0 -Users users.json -TlsCert relay.pfx -TlsPassword secret -HostName relay.example.org
#>
param(
    [int]$Port = 8765,
    [string]$Bind = '127.0.0.1',
    [string]$Token,
    [string]$Users,
    [string]$AddUser,
    [string[]]$AllowUser = @(),
    [switch]$PasswordStdin,
    [string[]]$Origin = @('null'),
    [string[]]$Allow = @(),
    [string]$CaFile,
    [string]$TlsCert,
    [string]$TlsKey,
    [string]$TlsPassword,
    [string[]]$HostName = @(),
    [string]$BasePath = '',
    [string[]]$TrustedProxy = @(),
    [string]$ProxyUserHeader,
    [double]$SessionHours = 12,
    [switch]$InsecureTransport,
    [switch]$Log
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Numerics  # loads an existing .NET assembly, no compilation

# arrays given as one argument ("a,b") with -File
function Split-List($values) { return @($values | ForEach-Object { "$_" -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
$Origin = Split-List $Origin; $Allow = Split-List $Allow; $AllowUser = Split-List $AllowUser
$HostName = Split-List $HostName; $TrustedProxy = Split-List $TrustedProxy

# Password hashes (shared with the Python relay): pbkdf2-sha256$<iterations>$<salt base64>$<hash base64>
$common = {
    function Get-Pbkdf2([string]$password, [byte[]]$salt, [int]$iterations) {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($password)
        $type = [System.Security.Cryptography.Rfc2898DeriveBytes]
        if ($type.GetMethod('Pbkdf2', [type[]]@([byte[]], [byte[]], [int], [System.Security.Cryptography.HashAlgorithmName], [int]))) {
            # .NET 6+ (PowerShell 7.2+): native implementation, much faster than the instance class
            return , $type::Pbkdf2($bytes, $salt, $iterations, [System.Security.Cryptography.HashAlgorithmName]::SHA256, 32)
        }
        $kdf = New-Object System.Security.Cryptography.Rfc2898DeriveBytes($bytes, $salt, $iterations, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
        try { return , $kdf.GetBytes(32) } finally { $kdf.Dispose() }
    }
    function Test-BytesEqual([byte[]]$a, [byte[]]$b) {
        if ($a.Length -ne $b.Length) { return $false }
        $diff = 0
        for ($i = 0; $i -lt $a.Length; $i++) { $diff = $diff -bor ($a[$i] -bxor $b[$i]) }
        return $diff -eq 0
    }
    function ConvertTo-PasswordHash([string]$password) {
        $salt = New-Object byte[] 16
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($salt)
        return 'pbkdf2-sha256$600000$' + [Convert]::ToBase64String($salt) + '$' + [Convert]::ToBase64String((Get-Pbkdf2 $password $salt 600000))
    }
    function Test-Password([string]$password, [string]$stored) {
        try {
            $parts = $stored.Split('$')
            if ($parts.Count -ne 4 -or $parts[0] -ne 'pbkdf2-sha256') { return $false }
            return Test-BytesEqual (Get-Pbkdf2 $password ([Convert]::FromBase64String($parts[2])) ([int]$parts[1])) ([Convert]::FromBase64String($parts[3]))
        } catch { return $false }
    }
}
. $common

function ConvertTo-Hashtable($object) {
    $result = [ordered]@{}
    if ($object) { foreach ($p in $object.PSObject.Properties) { $result[$p.Name] = $p.Value } }
    return $result
}

function Read-Users([string]$path) {
    $map = @{}
    if (-not $path) { return $map }
    $data = ConvertFrom-Json ([System.IO.File]::ReadAllText((Resolve-Path $path)))
    foreach ($p in $data.users.PSObject.Properties) { $map[$p.Name] = @{ Hash = [string]$p.Value.hash; Allow = @($p.Value.allow | Where-Object { $_ }) } }
    return $map
}

# ---- create or change an account ------------------------------------------------------------------

if ($AddUser) {
    if (-not $Users) { [Console]::Error.WriteLine('-AddUser needs -Users FILE'); exit 2 }
    if ($PasswordStdin) { $password = [Console]::In.ReadLine() }
    else {
        $a = Read-Host "Password for $AddUser" -AsSecureString
        $b = Read-Host 'Repeat the password' -AsSecureString
        $plain = { param($s) [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }
        $password = & $plain $a
        if ($password -ne (& $plain $b)) { [Console]::Error.WriteLine('The passwords do not match.'); exit 1 }
    }
    if ($password.Length -lt 8) { [Console]::Error.WriteLine('Use at least 8 characters.'); exit 1 }
    $data = [ordered]@{ users = [ordered]@{} }
    if (Test-Path $Users) {
        $existing = ConvertFrom-Json ([System.IO.File]::ReadAllText((Resolve-Path $Users)))
        foreach ($p in $existing.users.PSObject.Properties) { $data.users[$p.Name] = ConvertTo-Hashtable $p.Value }
    }
    $account = if ($data.users.Contains($AddUser)) { $data.users[$AddUser] } else { [ordered]@{} }
    $account['hash'] = ConvertTo-PasswordHash $password
    if ($AllowUser.Count) { $account['allow'] = $AllowUser }
    $data.users[$AddUser] = $account
    [System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($Users), (ConvertTo-Json $data -Depth 6) + "`n")
    Write-Host "Account $AddUser saved in $Users."
    exit 0
}

# ---- configuration ----------------------------------------------------------------------------------

$userMap = Read-Users $Users
if (-not $Token -and $userMap.Count -eq 0 -and -not $ProxyUserHeader) {
    $bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $Token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

$bindAddress = if ($Bind -eq 'localhost') { [System.Net.IPAddress]::Loopback } else { [System.Net.IPAddress]::Parse($Bind) }
if ((-not [System.Net.IPAddress]::IsLoopback($bindAddress)) -and -not $TlsCert -and $TrustedProxy.Count -eq 0 -and -not $InsecureTransport) {
    [Console]::Error.WriteLine('Listening on other addresses than loopback needs -TlsCert (TLS), a -TrustedProxy that terminates TLS, or -InsecureTransport (trusted networks only).')
    exit 2
}

$serverCert = $null
if ($TlsCert) {
    $certPath = (Resolve-Path $TlsCert).Path
    if ($certPath -match '\.(pfx|p12)$') {
        $serverCert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certPath, $TlsPassword, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable)
    } else {
        if (-not $TlsKey) { [Console]::Error.WriteLine('A PEM certificate (-TlsCert) needs -TlsKey.'); exit 2 }
        $type = [System.Security.Cryptography.X509Certificates.X509Certificate2]
        if (-not $type.GetMethod('CreateFromPemFile', [type[]]@([string], [string]))) { [Console]::Error.WriteLine('PEM files need PowerShell 7; use a .pfx file with -TlsPassword.'); exit 2 }
        $pem = $type::CreateFromPemFile($certPath, (Resolve-Path $TlsKey).Path)
        $serverCert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 (, $pem.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pkcs12))
    }
}

# trusted proxies as (network bytes, prefix length)
$proxyNets = @()
foreach ($p in $TrustedProxy) {
    $parts = $p.Split('/')
    $address = [System.Net.IPAddress]::Parse($parts[0])
    if ($address.IsIPv4MappedToIPv6) { $address = $address.MapToIPv4() }
    $bits = if ($parts.Count -gt 1) { [int]$parts[1] } else { $address.GetAddressBytes().Length * 8 }
    $proxyNets += , @{ Bytes = $address.GetAddressBytes(); Prefix = $bits }
}

$caCerts = @()
if ($CaFile) {
    $pem = [System.IO.File]::ReadAllText((Resolve-Path $CaFile))
    foreach ($m in [regex]::Matches($pem, '-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----')) {
        $caCerts += New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 (, [Convert]::FromBase64String(($m.Groups[1].Value -replace '\s', '')))
    }
}

$authMethods = @()
if ($Token) { $authMethods += 'token' }
if ($userMap.Count) { $authMethods += 'password' }
if ($ProxyUserHeader) { $authMethods += 'proxy' }

$config = @{
    Token = $Token; Origins = $Origin; Allow = $Allow; CaCerts = $caCerts; Log = [bool]$Log
    Users = $userMap; Hosts = @($HostName | ForEach-Object { $_.ToLowerInvariant() }); BasePath = $(if ($BasePath.Trim('/')) { '/' + $BasePath.Trim('/') } else { '' })
    ProxyNets = $proxyNets; ProxyUserHeader = $(if ($ProxyUserHeader) { $ProxyUserHeader.ToLowerInvariant() } else { $null })
    SessionSeconds = $SessionHours * 3600; Cert = $serverCert; Insecure = [bool]$InsecureTransport; AuthMethods = $authMethods
    Common = $common.ToString()
    Sessions = [hashtable]::Synchronized(@{}); Failures = [hashtable]::Synchronized(@{})
}

# Everything below runs in its own runspace per connection.
$handler = {
    param($client, $config)
    $ErrorActionPreference = 'Stop'

    $MaxHeader = 65536
    $MaxMessage = 16MB
    $Utf8 = New-Object System.Text.UTF8Encoding $false
    . ([scriptblock]::Create($config.Common))

    function Get-UnixTime { return ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() / 1000.0) }

    function Test-IsLoopback([string]$address) {
        $ip = $null
        if (-not [System.Net.IPAddress]::TryParse($address.Split('%')[0], [ref]$ip)) { return $false }
        if ($ip.IsIPv4MappedToIPv6) { $ip = $ip.MapToIPv4() }
        return [System.Net.IPAddress]::IsLoopback($ip)
    }

    function Test-TrustedProxy($ip) {
        if ($ip.IsIPv4MappedToIPv6) { $ip = $ip.MapToIPv4() }
        $bytes = $ip.GetAddressBytes()
        foreach ($net in $config.ProxyNets) {
            if ($net.Bytes.Length -ne $bytes.Length) { continue }
            $ok = $true
            for ($bit = 0; $bit -lt $net.Prefix; $bit++) {
                $mask = 0x80 -shr ($bit % 8)
                if (($bytes[[Math]::Floor($bit / 8)] -band $mask) -ne ($net.Bytes[[Math]::Floor($bit / 8)] -band $mask)) { $ok = $false; break }
            }
            if ($ok) { return $true }
        }
        return $false
    }

    # Who is asking: address, secure transport, behind a trusted proxy, user authenticated by the proxy
    function Get-ClientInfo($peer, $headers) {
        if ($peer.IsIPv4MappedToIPv6) { $peer = $peer.MapToIPv4() }
        $forwarded = [string]$headers['x-forwarded-for']
        if (-not $forwarded) { $forwarded = [string]$headers['forwarded'] }
        if (Test-TrustedProxy $peer) {
            $addr = ([string]$headers['x-forwarded-for']).Split(',')[-1].Trim()
            if (-not $addr) { $addr = $peer.ToString() }
            $proto = ([string]$headers['x-forwarded-proto']).Split(',')[0].Trim().ToLowerInvariant()
            $secure = [bool]$config.Cert -or $proto -eq 'https' -or (-not $forwarded -and [System.Net.IPAddress]::IsLoopback($peer))
            $user = $null
            if ($config.ProxyUserHeader -and $headers[$config.ProxyUserHeader]) { $user = [string]$headers[$config.ProxyUserHeader] }
            return @{ Addr = $addr; Secure = ($secure -or $config.Insecure); Proxied = $true; User = $user }
        }
        if ($forwarded) { throw (New-HttpError 403 'request through an untrusted proxy (start the relay with -TrustedProxy)') }
        return @{ Addr = $peer.ToString(); Secure = ([bool]$config.Cert -or [System.Net.IPAddress]::IsLoopback($peer) -or $config.Insecure); Proxied = $false; User = $null }
    }

    # Check a relay or session token (or the proxy user); returns the user name ('' for the relay token)
    function Confirm-Token($token, $info) {
        if ($info.User) { return $info.User }
        if (-not $info.Secure) { throw (New-HttpError 403 'credentials are only accepted over TLS') }
        $token = [string]$token
        if ($config.Token -and $token -and (Test-BytesEqual ([System.Text.Encoding]::UTF8.GetBytes($token)) ([System.Text.Encoding]::UTF8.GetBytes($config.Token)))) { return '' }
        $session = $config.Sessions[$token]
        if ($session -and $session.Expires -gt (Get-UnixTime)) {
            $session.Expires = (Get-UnixTime) + $config.SessionSeconds
            return $session.User
        }
        if ($token) { $config.Sessions.Remove($token) }
        if ($session) { throw (New-HttpError 401 'session expired') }
        throw (New-HttpError 401 'invalid token')
    }

    function Get-BlockSeconds([string[]]$keys) {
        $now = Get-UnixTime
        $wait = 0
        [System.Threading.Monitor]::Enter($config.Failures.SyncRoot)
        try {
            foreach ($key in $keys) {
                $recent = @($config.Failures[$key] | Where-Object { $now - $_ -lt 900 })
                $config.Failures[$key] = $recent
                if ($recent.Count -ge 5) {
                    $delay = [Math]::Min(900, 30 * [Math]::Pow(2, $recent.Count - 5))
                    $wait = [Math]::Max($wait, $recent[-1] + $delay - $now)
                }
            }
        } finally { [System.Threading.Monitor]::Exit($config.Failures.SyncRoot) }
        return [int][Math]::Ceiling($wait)
    }

    function Invoke-Login($spec, $info) {
        if ($config.Users.Count -eq 0) { throw (New-HttpError 404 'no user accounts configured') }
        if (-not $info.Secure) { throw (New-HttpError 403 'credentials are only accepted over TLS') }
        $user = [string]$spec.user; $password = [string]$spec.password
        $keys = @("user:$($user.ToLowerInvariant())", "addr:$($info.Addr)")
        $wait = Get-BlockSeconds $keys
        if ($wait -gt 0) { throw (New-HttpError 429 "too many failed logins, try again in $wait s") }
        $account = $config.Users[$user]
        $ok = $false
        if ($account) { $ok = Test-Password $password $account.Hash } else { [void](Test-Password $password 'pbkdf2-sha256$600000$MDAwMDAwMDAwMDAwMDAwMA==$AAAA') }
        [System.Threading.Monitor]::Enter($config.Failures.SyncRoot)
        try {
            foreach ($key in $keys) {
                if ($ok) { $config.Failures.Remove($key) } else { $config.Failures[$key] = @($config.Failures[$key]) + (Get-UnixTime) }
            }
        } finally { [System.Threading.Monitor]::Exit($config.Failures.SyncRoot) }
        if (-not $ok) { throw (New-HttpError 401 'invalid user or password') }
        $bytes = New-Object byte[] 32
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        $token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
        $expires = (Get-UnixTime) + $config.SessionSeconds
        $config.Sessions[$token] = [hashtable]::Synchronized(@{ User = $user; Expires = $expires })
        return [ordered]@{ token = $token; user = $user; expires = [int64]$expires }
    }

    function Write-Log([string]$message) {
        if ($config.Log) { [Console]::Error.WriteLine("relay: $message") }
    }

    function New-HttpError([int]$status, [string]$message) {
        $e = New-Object System.Exception $message
        $e.Data['status'] = $status
        return $e
    }

    function Get-CorsHeaders($origin) {
        if ($origin -and ($config.Origins -contains $origin)) { return [ordered]@{ 'Access-Control-Allow-Origin' = $origin; 'Vary' = 'Origin' } }
        return [ordered]@{}
    }

    function Write-HttpResponse($stream, [int]$status, [string]$reason, $headers, [byte[]]$body) {
        if ($null -eq $body) { $body = New-Object byte[] 0 }
        $sb = New-Object System.Text.StringBuilder
        [void]$sb.Append("HTTP/1.1 $status $reason`r`n")
        foreach ($k in $headers.Keys) { [void]$sb.Append("${k}: $($headers[$k])`r`n") }
        [void]$sb.Append("Content-Length: $($body.Length)`r`nConnection: close`r`n`r`n")
        $head = [System.Text.Encoding]::ASCII.GetBytes($sb.ToString())
        $stream.Write($head, 0, $head.Length)
        if ($body.Length) { $stream.Write($body, 0, $body.Length) }
        $stream.Flush()
    }

    function Write-Json($stream, [int]$status, $headers, $object) {
        $h = [ordered]@{}
        foreach ($k in $headers.Keys) { $h[$k] = $headers[$k] }
        $h['Content-Type'] = 'application/json'
        $reason = if ($status -lt 300) { 'OK' } else { 'Error' }
        Write-HttpResponse $stream $status $reason $h $Utf8.GetBytes((ConvertTo-Json $object -Compress -Depth 6))
    }

    function Test-TargetAllowed([string]$targetHost, [int]$targetPort, [string]$user = '') {
        $target = "${targetHost}:$targetPort"
        if ($config.Allow -and $config.Allow.Count) {
            $ok = $false
            foreach ($p in $config.Allow) { if ($target -like $p) { $ok = $true } }
            if (-not $ok) { return $false }
        }
        if ($user -and $config.Users[$user] -and $config.Users[$user].Allow.Count) {
            foreach ($p in $config.Users[$user].Allow) { if ($target -like $p) { return $true } }
            return $false
        }
        return $true
    }

    # Certificate validation with optional extra CAs. Called synchronously on this thread by
    # SslStream.AuthenticateAsClient, so a script block delegate is safe here.
    function New-CertCallback([bool]$insecure) {
        $cas = $config.CaCerts
        return [System.Net.Security.RemoteCertificateValidationCallback]{
            param($sender, $cert, $chain, $errors)
            if ($insecure) { return $true }
            if ($errors -eq [System.Net.Security.SslPolicyErrors]::None) { return $true }
            if ($errors -ne [System.Net.Security.SslPolicyErrors]::RemoteCertificateChainErrors -or -not $cas) { return $false }
            $c = New-Object System.Security.Cryptography.X509Certificates.X509Chain
            $c.ChainPolicy.RevocationMode = 'NoCheck'
            $c.ChainPolicy.VerificationFlags = 'AllowUnknownCertificateAuthority'
            foreach ($ca in $cas) { [void]$c.ChainPolicy.ExtraStore.Add($ca) }
            if (-not $c.Build((New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 (, $cert.GetRawCertData())))) { return $false }
            $root = $c.ChainElements[$c.ChainElements.Count - 1].Certificate
            foreach ($ca in $cas) { if ($ca.Thumbprint -eq $root.Thumbprint) { return $true } }
            return $false
        }.GetNewClosure()
    }

    function New-TlsStream($innerStream, [string]$targetHost, [bool]$insecure) {
        $ssl = New-Object System.Net.Security.SslStream($innerStream, $false, (New-CertCallback $insecure))
        $ssl.AuthenticateAsClient($targetHost)
        return $ssl
    }

    function Connect-Tcp([string]$targetHost, [int]$targetPort, [int]$timeoutMs) {
        $tcp = New-Object System.Net.Sockets.TcpClient
        try {
            if (-not $tcp.ConnectAsync($targetHost, $targetPort).Wait($timeoutMs)) { throw "connection timed out" }
        } catch {
            $tcp.Close()
            $inner = $_.Exception
            while ($inner.InnerException) { $inner = $inner.InnerException }
            throw $inner.Message
        }
        $tcp.NoDelay = $true
        return $tcp
    }

    # ---- WebSocket framing ---------------------------------------------------------------------

    function Invoke-Unmask([byte[]]$data, [byte[]]$mask) {
        # XOR with the repeated mask as one BigInteger operation (fast compared to a PowerShell loop)
        $n = $data.Length
        if ($n -eq 0) { return , $data }
        $key = New-Object byte[] ($n + 1)
        [Array]::Copy($mask, 0, $key, 0, [Math]::Min(4, $n))
        $filled = [Math]::Min(4, $n)
        while ($filled -lt $n) {
            $count = [Math]::Min($filled, $n - $filled)
            [Array]::Copy($key, 0, $key, $filled, $count)
            $filled += $count
        }
        $key[$n] = 0
        $d = New-Object byte[] ($n + 1)
        [Array]::Copy($data, 0, $d, 0, $n)
        $x = [System.Numerics.BigInteger]::op_ExclusiveOr((New-Object System.Numerics.BigInteger (, $d)), (New-Object System.Numerics.BigInteger (, $key)))
        $bytes = $x.ToByteArray()
        $result = New-Object byte[] $n
        [Array]::Copy($bytes, 0, $result, 0, [Math]::Min($bytes.Length, $n))
        return , $result
    }

    function Send-Frame($stream, [int]$opcode, [byte[]]$payload) {
        $n = $payload.Length
        if ($n -lt 126) { $header = [byte[]]@((0x80 -bor $opcode), $n) }
        elseif ($n -lt 65536) { $header = [byte[]]@((0x80 -bor $opcode), 126, ($n -shr 8), ($n -band 0xFF)) }
        else {
            $header = New-Object byte[] 10
            $header[0] = 0x80 -bor $opcode; $header[1] = 127
            $len = [BitConverter]::GetBytes([uint64]$n)
            if ([BitConverter]::IsLittleEndian) { [Array]::Reverse($len) }
            [Array]::Copy($len, 0, $header, 2, 8)
        }
        $frame = New-Object byte[] ($header.Length + $n)
        [Array]::Copy($header, 0, $frame, 0, $header.Length)
        if ($n) { [Array]::Copy($payload, 0, $frame, $header.Length, $n) }
        $stream.Write($frame, 0, $frame.Length)
        $stream.Flush()
    }

    function Send-Text($stream, $object) { Send-Frame $stream 1 $Utf8.GetBytes((ConvertTo-Json $object -Compress)) }

    # Incoming WebSocket bytes are collected in $ws.Buffer; Read-Messages returns complete messages.
    function Add-WsBytes($ws, [byte[]]$data, [int]$count) {
        if ($ws.Length + $count -gt $ws.Buffer.Length) {
            $bigger = New-Object byte[] ([Math]::Max($ws.Buffer.Length * 2, $ws.Length + $count))
            [Array]::Copy($ws.Buffer, 0, $bigger, 0, $ws.Length)
            $ws.Buffer = $bigger
        }
        [Array]::Copy($data, 0, $ws.Buffer, $ws.Length, $count)
        $ws.Length += $count
    }

    function Read-Messages($ws) {
        $messages = New-Object System.Collections.ArrayList
        while ($ws.Length -ge 2) {
            $b = $ws.Buffer
            $fin = ($b[0] -band 0x80) -ne 0
            $opcode = $b[0] -band 0x0F
            $masked = ($b[1] -band 0x80) -ne 0
            $len = [int64]($b[1] -band 0x7F)
            $pos = 2
            if ($len -eq 126) {
                if ($ws.Length -lt 4) { break }
                $len = ([int64]$b[2] -shl 8) -bor $b[3]; $pos = 4
            } elseif ($len -eq 127) {
                if ($ws.Length -lt 10) { break }
                $len = 0; for ($i = 2; $i -lt 10; $i++) { $len = ($len -shl 8) -bor $b[$i] }; $pos = 10
            }
            if (-not $masked -or $len -gt $MaxMessage) { [void]$messages.Add(@{ Opcode = 8 }); break }
            if ($ws.Length -lt $pos + 4 + $len) { break }
            $mask = New-Object byte[] 4
            [Array]::Copy($b, $pos, $mask, 0, 4)
            $payload = New-Object byte[] $len
            [Array]::Copy($b, $pos + 4, $payload, 0, $len)
            $payload = Invoke-Unmask $payload $mask
            $consumed = $pos + 4 + $len
            [Array]::Copy($b, $consumed, $b, 0, $ws.Length - $consumed)
            $ws.Length -= $consumed

            if ($opcode -ge 8) { [void]$messages.Add(@{ Opcode = $opcode; Payload = $payload }); continue }
            if ($opcode -ne 0) { $ws.MsgOpcode = $opcode }
            $ws.Message.Write($payload, 0, $payload.Length)
            if ($ws.Message.Length -gt $MaxMessage) { [void]$messages.Add(@{ Opcode = 8 }); break }
            if ($fin) {
                [void]$messages.Add(@{ Opcode = $ws.MsgOpcode; Payload = $ws.Message.ToArray() })
                $ws.Message.SetLength(0)
            }
        }
        return , $messages
    }

    # The browser side is always read asynchronously ($ws.Task), so that it works for plain sockets and for TLS
    # (SslStream may hold decrypted data that a socket poll does not see). Returns $false when the connection ended.
    function Receive-WsData($ws) {
        if (-not $ws.Task) { $ws.Task = $ws.Stream.ReadAsync($ws.ReadBuf, 0, $ws.ReadBuf.Length) }
        if (-not $ws.Task.IsCompleted) { return $true }
        $n = 0
        try { $n = $ws.Task.Result } catch { return $false }
        $ws.Task = $null
        if ($n -le 0) { return $false }
        Add-WsBytes $ws $ws.ReadBuf $n
        $ws.Task = $ws.Stream.ReadAsync($ws.ReadBuf, 0, $ws.ReadBuf.Length)
        return $true
    }

    # Wait until $ws has at least one complete message (used for the first message of the tunnel).
    function Wait-Message($ws, [int]$timeoutMs) {
        $deadline = [DateTime]::UtcNow.AddMilliseconds($timeoutMs)
        while ($true) {
            $messages = Read-Messages $ws
            if ($messages.Count) { return $messages[0] }
            if ([DateTime]::UtcNow -gt $deadline) { return $null }
            if (-not (Receive-WsData $ws)) { return $null }
            if ($ws.Task -and -not $ws.Task.IsCompleted) { [void]$ws.Task.Wait(100) }
        }
    }

    # ---- TCP tunnel ----------------------------------------------------------------------------

    function Start-Tunnel($ws) {
        $first = Wait-Message $ws 30000
        if (-not $first -or $first.Opcode -ne 1) { return }
        $tcp = $null
        try {
            $spec = ConvertFrom-Json $Utf8.GetString($first.Payload)
            $user = Confirm-Token $spec.token $ws.Client
            $targetHost = [string]$spec.host; $targetPort = [int]$spec.port
            if (-not (Test-TargetAllowed $targetHost $targetPort $user)) { throw "target not allowed: ${targetHost}:$targetPort" }
            $tcp = Connect-Tcp $targetHost $targetPort 20000
            $tcpStream = $tcp.GetStream()
            if ($spec.tls) { $tcpStream = New-TlsStream $tcpStream $targetHost ([bool]$spec.insecure) }
        } catch {
            Write-Log "tunnel refused: $($_.Exception.Message)"
            if ($tcp) { $tcp.Close() }
            Send-Text $ws.Stream @{ ok = $false; error = "$($_.Exception.Message)" }
            Send-Frame $ws.Stream 8 ([byte[]](3, 232))
            return
        }
        Send-Text $ws.Stream @{ ok = $true }

        # Plain TCP is polled (no pending read, so STARTTLS can wrap the stream at any time);
        # a TLS stream is read asynchronously because decrypted data may be buffered inside SslStream.
        $tls = [bool]$spec.tls
        $tcpBuf = New-Object byte[] 65536
        $tcpTask = $null
        if ($tls) { $tcpTask = $tcpStream.ReadAsync($tcpBuf, 0, $tcpBuf.Length) }
        try {
            while ($true) {
                $active = $false
                if (-not $ws.Task -or $ws.Task.IsCompleted) {
                    if (-not (Receive-WsData $ws)) { return }
                    $active = $true
                    foreach ($m in (Read-Messages $ws)) {
                        switch ($m.Opcode) {
                            2 { $tcpStream.Write($m.Payload, 0, $m.Payload.Length); $tcpStream.Flush() }
                            1 {
                                $control = ConvertFrom-Json $Utf8.GetString($m.Payload)
                                if ($control.op -eq 'starttls' -and -not $tls) {
                                    try {
                                        $tcpStream = New-TlsStream $tcpStream $targetHost ([bool]$control.insecure)
                                        $tls = $true
                                        $tcpTask = $tcpStream.ReadAsync($tcpBuf, 0, $tcpBuf.Length)
                                        Send-Text $ws.Stream ([ordered]@{ ok = $true; op = 'starttls' })
                                    } catch {
                                        Send-Text $ws.Stream ([ordered]@{ ok = $false; op = 'starttls'; error = "$($_.Exception.Message)" })
                                        return
                                    }
                                } else {
                                    Send-Text $ws.Stream @{ ok = $false; error = "unknown op: $($control.op)" }
                                }
                            }
                            8 { return }  # the close answer is sent in finally (only once)
                            9 { Send-Frame $ws.Stream 10 $m.Payload }
                        }
                    }
                }
                if ($tls) {
                    if ($tcpTask.IsCompleted) {
                        $n = $tcpTask.Result
                        if ($n -le 0) { return }
                        $chunk = New-Object byte[] $n
                        [Array]::Copy($tcpBuf, 0, $chunk, 0, $n)
                        Send-Frame $ws.Stream 2 $chunk
                        $tcpTask = $tcpStream.ReadAsync($tcpBuf, 0, $tcpBuf.Length)
                        $active = $true
                    }
                } elseif ($tcp.Client.Poll(0, [System.Net.Sockets.SelectMode]::SelectRead)) {
                    $n = $tcpStream.Read($tcpBuf, 0, $tcpBuf.Length)
                    if ($n -le 0) { return }
                    $chunk = New-Object byte[] $n
                    [Array]::Copy($tcpBuf, 0, $chunk, 0, $n)
                    Send-Frame $ws.Stream 2 $chunk
                    $active = $true
                }
                if (-not $active) {
                    if ($tls) {
                        [void][System.Threading.Tasks.Task]::WaitAny([System.Threading.Tasks.Task[]]@($ws.Task, $tcpTask), 5000)
                    } elseif (-not $ws.Task.Wait(5)) {
                        [void]$tcp.Client.Poll(5000, [System.Net.Sockets.SelectMode]::SelectRead)
                    }
                }
            }
        } catch {
            Write-Log "tunnel ended: $($_.Exception.Message) $($_.InvocationInfo.PositionMessage)"
        } finally {
            try { Send-Frame $ws.Stream 8 ([byte[]](3, 232)) } catch { }
            $tcp.Close()
        }
    }

    # ---- HTTP proxy (own minimal HTTP/1.1 client: all headers stay visible and unchanged) -------

    function Read-ToEnd($stream) {
        $ms = New-Object System.IO.MemoryStream
        $buf = New-Object byte[] 65536
        while (($n = $stream.Read($buf, 0, $buf.Length)) -gt 0) { $ms.Write($buf, 0, $n) }
        return , $ms.ToArray()
    }

    function Find-Bytes([byte[]]$data, [byte[]]$pattern, [int]$start) {
        for ($i = $start; $i -le $data.Length - $pattern.Length; $i++) {
            $ok = $true
            for ($j = 0; $j -lt $pattern.Length; $j++) { if ($data[$i + $j] -ne $pattern[$j]) { $ok = $false; break } }
            if ($ok) { return $i }
        }
        return -1
    }

    function Undo-Chunked([byte[]]$data) {
        $ms = New-Object System.IO.MemoryStream
        $pos = 0
        $crlf = [byte[]](13, 10)
        while ($true) {
            $eol = Find-Bytes $data $crlf $pos
            if ($eol -lt 0) { break }
            $size = [Convert]::ToInt32(([System.Text.Encoding]::ASCII.GetString($data, $pos, $eol - $pos).Split(';')[0].Trim()), 16)
            if ($size -eq 0) { break }
            $ms.Write($data, $eol + 2, [Math]::Min($size, $data.Length - $eol - 2))
            $pos = $eol + 2 + $size + 2
        }
        return , $ms.ToArray()
    }

    function Invoke-RawHttp($spec) {
        $url = [Uri][string]$spec.url
        $method = if ($spec.method) { [string]$spec.method } else { 'GET' }
        $body = if ($spec.body) { [Convert]::FromBase64String([string]$spec.body) } else { New-Object byte[] 0 }
        $timeoutMs = if ($spec.timeout) { [int]([double]$spec.timeout * 1000) } else { 30000 }
        $headers = @(); if ($spec.headers) { $headers = @($spec.headers) }
        $watch = [System.Diagnostics.Stopwatch]::StartNew()
        for ($redirects = 0; ; $redirects++) {
            $tcp = Connect-Tcp $url.Host $url.Port $timeoutMs
            try {
                $stream = $tcp.GetStream()
                $stream.ReadTimeout = $timeoutMs; $stream.WriteTimeout = $timeoutMs
                if ($url.Scheme -eq 'https') { $stream = New-TlsStream $stream $url.Host ([bool]$spec.insecure) }
                $sb = New-Object System.Text.StringBuilder
                [void]$sb.Append("$method $($url.PathAndQuery) HTTP/1.1`r`n")
                $names = @($headers | ForEach-Object { ([string]$_[0]).ToLowerInvariant() })
                if ($names -notcontains 'host') { [void]$sb.Append("Host: $($url.Authority)`r`n") }
                foreach ($h in $headers) { [void]$sb.Append("$($h[0]): $($h[1])`r`n") }
                if ($body.Length -or @('POST', 'PUT', 'PATCH') -contains $method) {
                    if ($names -notcontains 'content-length') { [void]$sb.Append("Content-Length: $($body.Length)`r`n") }
                }
                [void]$sb.Append("Connection: close`r`n`r`n")
                $head = [System.Text.Encoding]::UTF8.GetBytes($sb.ToString())
                $stream.Write($head, 0, $head.Length)
                if ($body.Length) { $stream.Write($body, 0, $body.Length) }
                $stream.Flush()
                $raw = Read-ToEnd $stream
            } finally { $tcp.Close() }

            $split = Find-Bytes $raw ([byte[]](13, 10, 13, 10)) 0
            if ($split -lt 0) { throw 'invalid HTTP response' }
            $lines = [System.Text.Encoding]::GetEncoding('iso-8859-1').GetString($raw, 0, $split) -split "`r`n"
            $statusParts = $lines[0].Split(' ', 3)
            $responseHeaders = New-Object System.Collections.ArrayList
            $lookup = @{}
            foreach ($line in $lines[1..($lines.Count - 1)]) {
                $i = $line.IndexOf(':')
                if ($i -gt 0) {
                    $k = $line.Substring(0, $i).Trim(); $v = $line.Substring($i + 1).Trim()
                    [void]$responseHeaders.Add([string[]]@($k, $v))
                    $lookup[$k.ToLowerInvariant()] = $v
                }
            }
            $content = New-Object byte[] ($raw.Length - $split - 4)
            [Array]::Copy($raw, $split + 4, $content, 0, $content.Length)
            if ($lookup['transfer-encoding'] -match 'chunked') { $content = Undo-Chunked $content }
            elseif ($lookup.ContainsKey('content-length')) {
                $len = [int]$lookup['content-length']
                if ($len -lt $content.Length) { $c = New-Object byte[] $len; [Array]::Copy($content, $c, $len); $content = $c }
            }
            $status = [int]$statusParts[1]
            if ($spec.followRedirects -and @(301, 302, 303, 307, 308) -contains $status -and $lookup['location'] -and $redirects -lt 10) {
                $url = New-Object Uri($url, $lookup['location'])
                if ($status -eq 303 -or (@(301, 302) -contains $status -and $method -eq 'POST')) { $method = 'GET'; $body = New-Object byte[] 0 }
                continue
            }
            return [ordered]@{
                status = $status; reason = $(if ($statusParts.Count -gt 2) { $statusParts[2] } else { '' })
                url = $url.AbsoluteUri; httpVersion = $statusParts[0]
                headers = $responseHeaders; body = [Convert]::ToBase64String($content)
                timeMs = [Math]::Round($watch.Elapsed.TotalMilliseconds, 1)
            }
        }
    }

    # ---- request dispatch ----------------------------------------------------------------------

    $stream = $client.GetStream()
    $origin = $null
    try {
        $client.NoDelay = $true
        $stream.ReadTimeout = 30000
        if ($config.Cert) {
            $tlsStream = New-Object System.Net.Security.SslStream($stream, $false)
            $tlsStream.AuthenticateAsServer($config.Cert, $false, [System.Security.Authentication.SslProtocols]::None, $false)
            $stream = $tlsStream
        }
        $buf = New-Object byte[] 65536
        $data = New-Object System.IO.MemoryStream
        $split = -1
        while ($split -lt 0) {
            $n = $stream.Read($buf, 0, $buf.Length)
            if ($n -le 0) { return }
            $data.Write($buf, 0, $n)
            if ($data.Length -gt $MaxHeader) { throw (New-HttpError 431 'headers too large') }
            $split = Find-Bytes $data.ToArray() ([byte[]](13, 10, 13, 10)) ([Math]::Max(0, $data.Length - $n - 3))
        }
        $stream.ReadTimeout = [System.Threading.Timeout]::Infinite
        $all = $data.ToArray()
        $lines = [System.Text.Encoding]::GetEncoding('iso-8859-1').GetString($all, 0, $split) -split "`r`n"
        $rest = New-Object byte[] ($all.Length - $split - 4)
        [Array]::Copy($all, $split + 4, $rest, 0, $rest.Length)
        function Read-JsonBody {
            $length = [int]$headers['content-length']
            if ($length -gt 64MB) { throw (New-HttpError 413 'request too large') }
            $bodyStream = New-Object System.IO.MemoryStream
            $bodyStream.Write($rest, 0, $rest.Length)
            while ($bodyStream.Length -lt $length) {
                $n = $stream.Read($buf, 0, [Math]::Min($buf.Length, $length - $bodyStream.Length))
                if ($n -le 0) { throw 'connection closed' }
                $bodyStream.Write($buf, 0, $n)
            }
            if ($length -eq 0) { return New-Object PSObject }
            try { return ConvertFrom-Json $Utf8.GetString($bodyStream.ToArray()) } catch { throw (New-HttpError 400 'invalid JSON') }
        }
        $requestLine = $lines[0].Split(' ')
        $method = $requestLine[0]; $path = $requestLine[1].Split('?')[0]
        $headers = @{}
        foreach ($line in $lines[1..($lines.Count - 1)]) {
            $i = $line.IndexOf(':')
            if ($i -gt 0) { $headers[$line.Substring(0, $i).Trim().ToLowerInvariant()] = $line.Substring($i + 1).Trim() }
        }
        $origin = $headers['origin']
        if ($config.BasePath -and ($path -eq $config.BasePath -or $path.StartsWith($config.BasePath + '/'))) {
            $path = $path.Substring($config.BasePath.Length)
            if (-not $path) { $path = '/' }
        }
        $info = Get-ClientInfo $client.Client.RemoteEndPoint.Address $headers
        $hostName = [string]$headers['host']
        if ($info.Proxied -and $headers['x-forwarded-host']) { $hostName = ([string]$headers['x-forwarded-host']).Split(',')[0].Trim() }
        if ($hostName.StartsWith('[')) { $hostName = $hostName.Split(']')[0] + ']' } else { $hostName = $hostName.Split(':')[0] }
        $hostName = $hostName.ToLowerInvariant()
        if (@('127.0.0.1', 'localhost', '[::1]') -notcontains $hostName -and $config.Hosts -notcontains $hostName -and $config.Hosts -notcontains '*') { throw (New-HttpError 403 'invalid Host header') }
        if ($null -ne $origin -and $config.Origins -notcontains $origin) { throw (New-HttpError 403 "origin not allowed: $origin") }

        if ($method -eq 'OPTIONS') {
            $h = Get-CorsHeaders $origin
            $h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
            $h['Access-Control-Allow-Headers'] = 'Content-Type, X-Relay-Token'
            $h['Access-Control-Max-Age'] = '600'
            $h['Access-Control-Allow-Private-Network'] = 'true'
            Write-HttpResponse $stream 204 'No Content' $h $null
        } elseif ($method -eq 'GET' -and $path -eq '/info') {
            Write-Json $stream 200 (Get-CorsHeaders $origin) ([ordered]@{ relay = 'portable-web-app-suite'; version = 2; implementation = 'powershell'
                auth = @($config.AuthMethods); tls = ([bool]$config.Cert -or ($info.Proxied -and $info.Secure)) })
        } elseif ($method -eq 'GET' -and $path -eq '/tcp' -and ([string]$headers['upgrade']).ToLowerInvariant() -eq 'websocket') {
            $key = $headers['sec-websocket-key']
            if (-not $key -or $headers['sec-websocket-version'] -ne '13') { throw (New-HttpError 400 'invalid WebSocket handshake') }
            $sha1 = [System.Security.Cryptography.SHA1]::Create()
            $accept = [Convert]::ToBase64String($sha1.ComputeHash([System.Text.Encoding]::ASCII.GetBytes($key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')))
            $response = [System.Text.Encoding]::ASCII.GetBytes("HTTP/1.1 101 Switching Protocols`r`nUpgrade: websocket`r`nConnection: Upgrade`r`nSec-WebSocket-Accept: $accept`r`n`r`n")
            $stream.Write($response, 0, $response.Length)
            $ws = @{ Stream = $stream; Buffer = (New-Object byte[] 131072); Length = 0; Message = (New-Object System.IO.MemoryStream); MsgOpcode = 0
                     ReadBuf = (New-Object byte[] 65536); Task = $null; Client = $info }
            if ($rest.Length) { Add-WsBytes $ws $rest $rest.Length }
            Start-Tunnel $ws
        } elseif ($method -eq 'POST' -and $path -eq '/auth') {
            $spec = Read-JsonBody
            Write-Json $stream 200 (Get-CorsHeaders $origin) (Invoke-Login $spec $info)
        } elseif ($method -eq 'POST' -and $path -eq '/auth/logout') {
            $config.Sessions.Remove([string]$headers['x-relay-token'])
            Write-HttpResponse $stream 204 'No Content' (Get-CorsHeaders $origin) $null
        } elseif ($method -eq 'POST' -and $path -eq '/http') {
            $user = Confirm-Token $headers['x-relay-token'] $info
            $spec = Read-JsonBody
            $url = $null
            if (-not [Uri]::TryCreate([string]$spec.url, 'Absolute', [ref]$url) -or @('http', 'https') -notcontains $url.Scheme) {
                throw (New-HttpError 400 'only http and https URLs are supported')
            }
            if (-not (Test-TargetAllowed $url.Host $url.Port $user)) { throw (New-HttpError 403 "target not allowed: $($url.Host):$($url.Port)") }
            try {
                $result = Invoke-RawHttp $spec
                Write-Json $stream 200 (Get-CorsHeaders $origin) $result
            } catch {
                Write-Json $stream 502 (Get-CorsHeaders $origin) @{ error = "$($_.Exception.Message)" }
            }
        } else {
            throw (New-HttpError 404 'not found')
        }
    } catch {
        $status = $_.Exception.Data['status']
        if (-not $status) { Write-Log "request failed: $($_.Exception.Message) $($_.InvocationInfo.PositionMessage)" }
        if ($status) {
            try { Write-Json $stream $status (Get-CorsHeaders $origin) @{ error = $_.Exception.Message } } catch { }
        }
    } finally {
        $client.Close()
    }
}

# ---- main: accept connections, one runspace per connection -------------------------------------

$listener = New-Object System.Net.Sockets.TcpListener ($bindAddress, $Port)
$listener.Start()
$shown = if ($bindAddress.AddressFamily -eq 'InterNetworkV6') { "[$bindAddress]" } else { "$bindAddress" }
Write-Host "Relay listening on ${shown}:$($listener.LocalEndpoint.Port)$(if ($serverCert) { ' (TLS)' })"
if ($Token) { Write-Host "Token: $Token" }
if ($userMap.Count) { Write-Host "User accounts: $($userMap.Count) ($Users)" }
if ($ProxyUserHeader) { Write-Host "Users authenticated by the reverse proxy (header $ProxyUserHeader)" }
[Console]::Out.Flush()

$pool = [runspacefactory]::CreateRunspacePool(1, 64)
$pool.Open()
$jobs = New-Object System.Collections.ArrayList
$handlerText = $handler.ToString()
try {
    while ($true) {
        if (-not $listener.Pending()) {
            Start-Sleep -Milliseconds 20
            foreach ($job in @($jobs)) {
                if ($job.Handle.IsCompleted) {
                    try { [void]$job.PowerShell.EndInvoke($job.Handle) } catch { }
                    $job.PowerShell.Dispose()
                    $jobs.Remove($job)
                }
            }
            continue
        }
        $client = $listener.AcceptTcpClient()
        $ps = [powershell]::Create()
        $ps.RunspacePool = $pool
        [void]$ps.AddScript($handlerText).AddArgument($client).AddArgument($config)
        [void]$jobs.Add(@{ PowerShell = $ps; Handle = $ps.BeginInvoke() })
    }
} finally {
    $listener.Stop()
    $pool.Close()
}
