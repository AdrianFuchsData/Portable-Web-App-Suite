# Python notebook

The Python notebook (`notebook.html`) runs Python 3 in the browser — without installation, server or internet connection. It works
like Jupyter: notebooks with code and text cells, results directly below the code, plots, tables. A console runs single commands.

Included libraries: numpy, pandas, matplotlib, seaborn, sympy, networkx, lxml, beautifulsoup4, pyyaml, openpyxl, xlrd, regex, requests,
sqlite3, SQLAlchemy, pykeepass, nzpy and micropip. They are loaded when they are imported for the first time; numpy, pandas and matplotlib
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

In command mode (a cell is selected, the cursor is not in it): `Enter` edits, `A`/`B` insert a cell above/below, `M` makes it a Markdown
cell, `Y` a code cell, `↑`/`↓` select, `Delete` deletes the cell.

Outputs: printed text, errors (only your code in the traceback), the result of the last line, tables (pandas), plots (matplotlib, also
without `plt.show()`), HTML and Markdown. HTML and Markdown from notebooks are shown without scripts.

In command mode, `Z` or `Ctrl+Z` (and ↶ in the toolbar) undoes the last cell operation: inserting, deleting, moving, changing the type, clearing outputs; `Shift+Z`, `Ctrl+Y` or ↷ redoes it. Inside a cell, `Ctrl+Z` undoes typing in that cell. Running cells is not undone.

In **Slideshow** mode every cell shows a slide type (slide, sub-slide, fragment, skip, notes – stored in the notebook like in Jupyter), and **🎞️ Slides** opens the notebook as a reveal.js presentation in the [web slides](reveal.md) app.

**Spelling:** with a language chosen in the **ABC** selector of the header, Markdown cells are checked completely and code
cells in their comments and strings; right-click an underlined word for suggestions ([Spelling](../user-guide.md#spelling)).

## Console

The **Console** tab runs single commands in the same Python session as the notebook (variables are shared). `Enter` runs, `Shift+Enter` starts a
new line, `↑`/`↓` recall earlier commands. **Clear** empties the console.

## Files and packages

The **Files** panel shows Python's working folder (`/home/pyodide`):

- **Upload…** copies files from your computer into the folder (or drop them onto the window), so Python can read them, e.g. with
  `pd.read_csv('data.csv')`.
- Click a file to download it (e.g. results written by Python), × deletes it, folders open with a click.
- **Install wheel…** installs further Python packages from wheel files (`.whl`): pure-Python packages from PyPI, or packages built for
  Pyodide. They stay installed until the page is closed (also after a restart).

The files only exist while the page is open: download results you want to keep.

↗ next to a file in the files panel (**Open with…**) opens it in another application of the suite (e.g. the text editor or spreadsheet); saving there writes it back into the Python file system.

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

## Restart

**⟲ Restart** stops a running cell and starts Python again: all variables are lost, files and installed wheels stay.

## Limits

- Network: `requests` works for servers that allow access from web pages (CORS); raw TCP connections (databases, SSH, mail) are not possible in
  the browser — use the suite's database tool, SSH client or mail client for those.
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

### Command mode

| Keys | Function |
|---|---|
| `Enter` | Edit the cell |
| `A` / `B` | Insert a cell above / below |
| `M` / `Y` / `R` | Make it Markdown / code / raw (kept unchanged for nbconvert) |
| `↑` / `↓` | Previous / next cell |
| `Delete` | Delete the cell |
| `Z` / `Shift+Z` | Undo / redo cell operations |

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
