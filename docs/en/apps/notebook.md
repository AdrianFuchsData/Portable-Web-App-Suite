# Python notebook

The Python notebook (`notebook.html`) runs Python 3 in the browser — without installation, server or internet connection. It works
like Jupyter: notebooks with code and text cells, results directly below the code, plots, tables. A console runs single commands.

Included libraries: numpy, pandas, matplotlib, seaborn, scipy, scikit-learn, sympy, networkx, lxml, beautifulsoup4, pyyaml, openpyxl, xlrd, regex, requests,
sqlite3, SQLAlchemy, pykeepass, nzpy, micropip; for office files python-docx, python-pptx, XlsxWriter (also as pandas' Excel writer), pypdf and
icalendar; for databases over the relay pg8000 (PostgreSQL) and PyMySQL (MySQL/MariaDB), also through SQLAlchemy; Jinja2 (with MarkupSafe),
Markdown, tabulate and tqdm. They are loaded when they are imported for the first time; numpy, pandas and matplotlib
are prepared in the background after the start. The first start takes a few seconds; the status at the top right shows when Python is
ready.

## Notebooks

- **Open** (`Ctrl+O`) opens a Jupyter notebook (`.ipynb`) or a Python script. In scripts, `# %%` starts a code cell and `# %% [markdown]` a
  text cell (the format of VS Code, Spyder and Jupytext); a script without markers becomes one cell. Raw cells (for nbconvert) are
  shown as plain text, marked *Raw*, and saved unchanged.
- **Save** (`Ctrl+S`) saves the notebook as `.ipynb` (with outputs): directly into the file in Chrome/Edge on the desktop, as a download in
  Firefox and on Android. **Save as** saves under a new name. **Export…** downloads the notebook as a Python script (`.py`), as an **HTML page**
  with code, Markdown and outputs (tables, charts) that opens in any browser, as an **HTML page without code** (a report of the
  results), or prints it (**PDF**: choose "Save as PDF" as the printer).
- **New** starts an empty notebook.

## Cells

- **+ Code** and **+ Markdown** insert a cell below the selected one; the buttons next to a cell run it (▶), switch its type
  (M / { }), move it (↑ ↓) or delete it (✕).
- Markdown cells show formatted text after running; double-click to edit them again.
- **▶▶ Run all** runs all cells from the top; **Clear outputs** removes all results.

| Key | In a cell (editing) |
|---|---|
| `Shift+Enter` | run and go to the next cell (a new one at the end) |
| `Ctrl+Enter` | run and stay |
| `Alt+Enter` | run and insert a new cell below |
| `Escape` | leave the editor (command mode) |
| `Tab` / `Shift+Tab` | indent / unindent (4 spaces) |
| `Ctrl+Alt+I` | insert a tab character |

In **command mode** (a cell is selected, the cursor is not in it) the keys work as in JupyterLab: `Enter` edits, `A`/`B` insert a cell
above/below, `M`/`Y`/`R` make the cells Markdown, code or raw cells, `↑`/`↓` (or `K`/`J`) select the previous/next cell.

**Several cells:** `Shift+↑`/`Shift+↓` (or `Shift+K`/`Shift+J`) and `Shift+click` select several cells, `Ctrl+A` all of them. The keys then
apply to all selected cells: `Shift+Enter`, `Ctrl+Enter` and `Alt+Enter` run them, `C` copies, `X` cuts, `V` pastes below (`Shift+V` above),
`D`, `D` (twice) or `Delete` deletes, `Shift+M` merges them into one cell (one selected cell: with the next one), `Ctrl+Shift+↑`/`↓`
moves them.

**Running:** cells run one after another; waiting cells show `[*]`. **Stop on error** (on by default, next to **▶▶ Run all**): when a cell
raises an error, the cells waiting after it are not run, as in Jupyter. Switched off, they run anyway.

Outputs: printed text, errors (only your code in the traceback), the result of the last line, tables (pandas), plots (matplotlib, also
without `plt.show()`), HTML and Markdown. HTML and Markdown from notebooks are shown without scripts.

In command mode, `Z` or `Ctrl+Z` (and ↶ in the toolbar) undoes the last cell operation: inserting, deleting, moving, changing the type, clearing outputs; `Shift+Z`, `Ctrl+Y` or ↷ redoes it. Inside a cell, `Ctrl+Z` undoes typing in that cell. Running cells is not undone.

In **Slideshow** mode every cell shows a slide type (slide, sub-slide, fragment, skip, notes – stored in the notebook like in Jupyter), and **🎞️ Slides** opens the notebook as a reveal.js presentation in the [web slides](reveal.md) app.

**Spelling:** with a language chosen in the **ABC** selector of the header, Markdown cells are checked completely and code
cells in their comments and strings; right-click an underlined word for suggestions ([Spelling](../user-guide.md#spelling)).

## Console

The **Console** tab runs single commands in the same Python session as the notebook (variables are shared). `Enter` runs, `Shift+Enter` starts a
new line, `↑`/`↓` recall earlier commands. **Clear** empties the console.

## Terminal

The **Terminal** tab has a bash-like shell on Python's file system (the same files as the Files panel and the cells; it lives only in
memory). It is written in Python and runs in the notebook's Python, so it works offline everywhere.

- **Commands:** `ls`, `cd`, `pwd`, `cat`, `cp`, `mv`, `rm`, `mkdir`, `rmdir`, `touch`, `find` (`-name`, `-iname`, `-type`, `-maxdepth`), `du`,
  `head`, `tail`, `wc`, `grep` (Python regular expressions; `-i -v -n -c -l -r -o -w -x -F`), `sed` (`s///` with `g`, `i` and a number, `d`,
  `p`, `=`, `q`; addresses `N`, `$`, `/re/` and ranges; `-n`, `-i`, `-e`), `sort` (`-r -n -u -k -t -f`), `uniq` (`-c -d -u`), `cut` (`-d -f -c`),
  `tr` (ranges, classes, `-d -s`), `diff` (`-u`, `-q`), `echo`, `printf`, `tar` (`-c -x -t`, `-z -j -J`, `-f`, `-C`), `zip` (`-r`), `unzip` (`-l -d`),
  `python script.py` / `python -c …`, `pip install` (micropip; needs the network), `mount` / `umount` (archives of the archive manager,
  see [Archives in Python](#archives-in-python)), `env`, `export`, `unset`, `history`, `clear`, `which`, `basename`, `dirname`, `date`, `sleep`,
  `true`, `false` and `help`.
- **Command lines** are split like in a POSIX shell (`shlex`): quotes, `\`, comments (`#`), pipes `|`, redirections `>`, `>>`, `<`, `2>`,
  `2>&1`, `&&`, `||` and `;`, globs (`*`, `?`, `[…]`), variables (`NAME=value`, `$NAME`, `${NAME}`, `$?`, `~`) and `!N` (a line of the history).
  There are no control structures (`if`, `for`, `while`), no background jobs and no other programs.
- **Scripts:** `sh script.sh arguments` (also `bash`, `source` or `./script.sh`) runs the lines of a script in this shell with `$1`…`$9`,
  `$#` and `$@`; `set -e` stops at the first error, `exit` ends the script. Scripts from an archive run after mounting it, e.g.
  `mount data.zip && sh /mnt/data.zip/run.sh`.
- **Keys:** `↑`/`↓` history, `Tab` completes commands and paths (twice: shows the choices), `Ctrl+C` cancels the line (or interrupts a running
  command where possible), `Ctrl+L` clears the screen, `Ctrl+U` deletes the line, `Ctrl+A`/`Ctrl+E` start/end of the line.
- **less** shows a file or the output of a pipe (`… | less`): `Space`/`PgDn` and `b`/`PgUp` page, `↑`/`↓`/`j`/`k` line, `g`/`G` start/end,
  `/text` searches, `n`/`N` next/previous match, `q` quits.
- **nano** edits a file: type, cursor keys, `Ctrl+O` saves (asks for the name), `Ctrl+X` exits (asks about unsaved changes), `Ctrl+W` searches,
  `Ctrl+K` cuts the line, `Ctrl+U` pastes. Changes are written to Python's file system.
- **In cells:** `await suite.shell.run("ls -l | head")` runs a command line and prints its output (less shows the text, nano works only in the
  Terminal tab).

## Files and packages

The **Files** panel shows Python's working folder (`/home/pyodide`):

- **Upload…** copies files from your computer into the folder (or drop them onto the window), so Python can read them, e.g. with
  `pd.read_csv('data.csv')`.
- Click a file to download it (e.g. results written by Python), × deletes it, folders open with a click.
- **Install wheel…** installs further Python packages from wheel files (`.whl`): pure-Python packages from PyPI, or packages built for
  Pyodide. They stay installed until the page is closed (also after a restart).

The files only exist while the page is open: download results you want to keep.

Other applications of the suite open files from this file system and save files into it (*Open* / *Save as*, section *Python
notebooks (in memory)*, see [Files in archives](../user-guide.md#files-in-archives)): the notebook then shows what is asked for –
the folder and the name for saving, or the files to open – with the reminder that the files exist only in memory. **Save** in the
other application writes the file here again. A restart of Python asks first while such files are open elsewhere.

↗ next to a file in the files panel (**Open with…**) opens it in another application of the suite (e.g. the text editor or spreadsheet); saving there writes it back into the Python file system.

### Adding packages at runtime

Packages built for Pyodide that are not bundled – for example **statsmodels**, **shapely**, **pyproj** and **scikit-image** – can be
added while the notebook runs. They must match the bundled Pyodide version (314.0.7); the files are in the Pyodide distribution at
`https://cdn.jsdelivr.net/pyodide/v314.0.7/full/<file>`:

| Package | Files (in this order, after the bundled dependencies) |
|---|---|
| statsmodels | `patsy-1.0.2-py2.py3-none-any.whl`, `statsmodels-0.14.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl` |
| shapely | `shapely-2.1.2-cp314-cp314-pyemscripten_2026_0_wasm32.whl` |
| pyproj | `pyproj-3.7.2-cp314-cp314-pyemscripten_2026_0_wasm32.whl` |
| scikit-image | `imageio-2.37.3-py3-none-any.whl`, `pywavelets-1.9.0-cp314-cp314-pyemscripten_2026_0_wasm32.whl`, `lazy_loader-0.5-py3-none-any.whl`, `scikit_image-0.26.0-cp314-cp314-pyemscripten_2026_0_wasm32.whl` |

- **Offline:** download the files once, then choose all of them at once with **Install wheel…** in the Files panel. They stay
  installed until the page is closed, also after a restart.
- **With internet access:** install them in a cell (they are gone after a restart):

  ```python
  import micropip
  base = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/"
  await micropip.install([base + "patsy-1.0.2-py2.py3-none-any.whl", base + "statsmodels-0.14.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl"])
  import statsmodels.api as sm
  ```

Pure-Python packages from PyPI (wheels ending in `py3-none-any.whl`) are added the same way; packages with compiled code need wheels
built for Pyodide.

## Archives in Python

Archives open in the [archive manager](archive.md) can be **mounted**: their files appear as ordinary files below
`/mnt/<archive name>`, so `os`, `open`, `pathlib`, `shutil`, `glob` and libraries such as pandas use them without anything
special.

- **📦 Mount archive…** in the Files panel lists the open archives (or starts the archive manager to open or create one); the
  archive manager asks you to allow it. Mounted archives are listed in the Files panel; ⏏ unmounts one.
- After **every cell** (and console command) new, changed and deleted files are written back into the archive. The archive
  manager marks it as changed – save the archive there to keep the changes.
- The whole archive is copied into the notebook's memory (it asks first above 512 MiB). Changes made in the archive manager
  while the archive is mounted are not seen by the notebook: unmount and mount it again.
- If the archive is closed or replaced in the archive manager, the notebook says so after the next cell; the files stay in
  `/mnt`, but further changes are no longer saved into the archive. A restart of Python unmounts all archives.

In code, the module `suite` does the same (awaited in a cell):

```python
import suite
path = await suite.archives.mount()            # the archive open in the archive manager (it asks you to allow it)
path = await suite.archives.mount("data.zip")  # one of several open archives, by name
await suite.archives.sync()                    # write the changes back now
await suite.archives.mounted()                 # [{"name", "path", "closed"}]
await suite.archives.unmount("data.zip")       # write the changes back and remove the folder
```

`suite.archives.mount()` can only reach archive managers that are already open (in the overview: its tabs; otherwise the
archive manager windows started from the notebook, or the one that started it): to open or create an archive, use the button.
Notebooks that should also run in a regular Jupyter installation import `suite` in a `try` block and use a folder there
(see the example notebooks).

## Network from Python

Python in the browser cannot open network connections itself; the notebook uses the [relay](../user-guide.md#network-functions-and-the-relay)
for them. Set it in the Files panel under **Network: Relay** (address and token, or a connections file). The header shows what is
possible:

- **Opened as a file** (`file://`): **`requests`** goes through the relay – every request of the module, to any server, with all
  headers and cookies. Without a relay, `requests` only reaches servers that allow access from web pages (CORS). Sockets and SSH
  are not possible, and stopping a cell restarts Python.
- **🔓 Network and interrupt** – the notebook served by the relay (`relay.py --serve`): additionally **sockets** – the standard
  library's network modules work unchanged through the relay: `smtplib` (also `starttls()` and `SMTP_SSL`), `imaplib`, `poplib`,
  `ftplib` (passive mode), `http.client`, `urllib.request` and pure-Python database drivers. TLS is done by the relay, which checks the
  server's certificate (unless the code switches checking off). Listening sockets, UDP and raw sockets are not possible. Running cells
  can be interrupted.

```python
import requests
r = requests.get("https://api.example.org/items", params={"q": "x"}, timeout=10)
r.raise_for_status(); r.json()

import smtplib                                   # served by the relay only
with smtplib.SMTP("mail.example.org", 587) as s:
    s.starttls(); s.login("anna", password); s.send_message(message)
```

**SSH and SFTP** (served by the relay only) use the suite's SSH engine with a subset of Fabric's `Connection` – so a notebook can use
Fabric itself in a regular Jupyter installation:

```python
try:
    from suite.ssh import Connection             # in the suite
except ModuleNotFoundError:
    from fabric import Connection                # regular Jupyter with Fabric

with Connection("server.example.org", user="anna", connect_kwargs={"key_filename": "id_ed25519"}) as c:
    result = c.run("df -h", hide=True)           # Result: stdout, stderr, exited, ok; warn=True: no exception on failure
    print(result.stdout)
    c.put("report.csv", "/tmp/report.csv")       # upload
    c.get("/var/log/syslog", "syslog.txt")       # download
    sftp = c.sftp()                              # like paramiko's SFTPClient
    print(sftp.listdir("/tmp"))
    with sftp.open("/tmp/notes.txt", "w") as f:
        f.write("hello")
```

`connect_kwargs` takes `password`, `key_filename` (a key file in the Files panel, OpenSSH or PEM format), `passphrase` or `pkey_text`
(the key as text). The first connection to a server shows its host key fingerprint and asks whether to trust it (remembered in this
browser); a changed key is asked for with a warning. The encryption is end to end between the browser and the server. `suite.net.status()`
reports what is available.

## Variables

**Variables** next to **Files** in the side panel lists the variables of the running Python session after every run: name,
type (with the `dtype` of NumPy arrays), size (`rows × columns` of DataFrames and arrays, the length of lists and strings)
and a short value (the column names of DataFrames). Modules, functions, classes and names starting with `_` are left out.
A click on a DataFrame, Series or array (▦) shows it as a table (up to 500 rows and 50 columns).

## Interactive widgets

Cells can show controls with the usual `ipywidgets` API (built in, nothing to install):

```python
import ipywidgets as widgets

@widgets.interact(freq=(1, 10), kind=['sin', 'cos'])
def plot(freq=3, kind='sin'):
    ...                      # print, return a value or draw with matplotlib: the output is updated on every change
```

Available are sliders (`IntSlider`, `FloatSlider`, `FloatLogSlider`, range sliders, `SelectionSlider`), number and text fields,
`Checkbox`, `ToggleButton`, `Dropdown`, `RadioButtons`, `Select`, `SelectMultiple`, `ToggleButtons`, `Button` (`on_click`),
`ColorPicker`, `DatePicker`, `Play`, progress bars, `Label`, `HTML`, `Output` (`with out:` collects prints, displays and figures),
the containers `HBox`, `VBox`, `GridBox`, `Tab` and `Accordion`, as well as `interact`, `interactive`, `interact_manual`, `fixed`,
`observe`, `link` and `dlink`. `from IPython.display import display, clear_output, HTML, Markdown` works too.

Prints and errors of callbacks outside an `Output` widget appear below the cell that created the widget. Saved notebooks keep the
state of the widgets (in the format of Jupyter): after opening, the controls are shown as they were but are inactive until the cell
runs again; the same applies after a restart. Custom widget libraries (e.g. `ipyleaflet`, `bqplot`) are not supported.

## Stop and restart

While cells run, the toolbar shows a stop button (also `I`, `I` in command mode):

- **⏹ Interrupt** – when the notebook is served by the relay (`relay.py --serve`, see [Relay](../user-guide.md#network-functions-and-the-relay)): the running cell
  stops with a `KeyboardInterrupt`, as in Jupyter; variables and imports are kept. The cells waiting after it are not run. Code inside
  a long single call of compiled code (one huge numpy operation) stops when that call returns.
- **⏹ Stop** – when the notebook is opened as a file (`file://`): browsers only let a page interrupt Python when it is served with special
  headers, so stopping means restarting Python after a confirmation; variables are lost.

**⟲ Restart** (also `0`, `0` in command mode) starts Python again at any time, also while code runs: all variables are lost, files
and installed wheels stay.

## Limits

- Network: through the relay only (see [Network from Python](#network-from-python)); sockets and SSH only when the notebook is served by the
  relay.
- Only packages included in the suite or available as wheels can be used; packages with compiled code need wheels built for Pyodide.

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Files

| Keys | Function |
|---|---|
| `Ctrl+O` | Open |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save as |

### In a cell

| Keys | Function |
|---|---|
| `Shift+Enter` | Run and go to the next cell |
| `Ctrl+Enter` | Run |
| `Alt+Enter` | Run and insert a cell below |
| `Esc` | Leave the cell (command mode) |
| `Tab` / `Shift+Tab` | Indent / unindent |
| `Ctrl+Alt+I` | Insert a tab character |

### Command mode

| Keys | Function |
|---|---|
| `Enter` | Edit the cell |
| `Shift+Enter` / `Ctrl+Enter` / `Alt+Enter` | Run the selected cells and go on / stay / insert a cell below |
| `A` / `B` | Insert a cell above / below |
| `M` / `Y` / `R` | Make them Markdown / code / raw (kept unchanged for nbconvert) |
| `↑` / `↓`, `K` / `J` | Previous / next cell |
| `Shift+↑` / `Shift+↓`, `Shift+K` / `Shift+J` | Select further cells |
| `Ctrl+A` | Select all cells |
| `C` / `X` / `V` | Copy / cut / paste below |
| `Shift+V` | Paste above |
| `D`, `D` / `Delete` | Delete the selected cells |
| `Shift+M` | Merge the selected cells |
| `Ctrl+Shift+↑` / `Ctrl+Shift+↓` | Move the selected cells |
| `I`, `I` | Interrupt (or stop by restarting) |
| `0`, `0` | Restart Python |
| `Z` / `Shift+Z` | Undo / redo cell operations |

### Terminal

| Keys | Function |
|---|---|
| `↑` / `↓` | Previous / next command |
| `Tab` | Complete a command or path |
| `Ctrl+C` | Cancel the line, interrupt a command |
| `Ctrl+L` | Clear the screen |

### Console

| Keys | Function |
|---|---|
| `Enter` | Run the command |
| `↑` / `↓` | Previous / next command |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

The cell buttons are shown below each cell; **Files · Variables** opens the side panel.
