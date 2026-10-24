# Text editor

The text editor (`texteditor.html`) edits text files and source code: several files in tabs, syntax highlighting
for more than 40 languages (including SAS, with code completion), search and replace, multiple cursors, and control over encoding and line endings.

## Opening and creating files

- **Open** (`Ctrl+O`) opens one or more files; you can also drag files onto the window.
- **New** (`Alt+N`) creates an empty document.
- **Recent** (Chrome/Edge on the desktop) reopens recently used files.

Every file opens in its own tab. A dot (●) on a tab shows unsaved changes. Close a tab with × or `Alt+W`; if it has
unsaved changes, the editor asks first. With the keyboard, move to a tab with `Tab` and press `Enter` to show it or
`Delete` to close it.

## Saving

- **Save** (`Ctrl+S`) writes the file. In Chrome/Edge on the desktop the opened file is changed directly; in Firefox
  and on Android the file is downloaded – replace the original file with it.
- **Save as** (`Ctrl+Shift+S`) saves under a new name. New documents are always saved with "Save as".

## Editing

| Function | Keys |
|---|---|
| Find / replace (also with regular expressions) | `Ctrl+F`, or 🔍 |
| Go to line | `Ctrl+G`, or ↧ |
| Add a cursor | `Ctrl+click` |
| Column of cursors (rectangular selection) | `Alt+drag` with the mouse |
| Select the next occurrence of the word | `Ctrl+D` |
| Undo / redo | `Ctrl+Z` / `Ctrl+Y` or `Ctrl+Shift+Z` |
| Indent: the selected lines, or up to the next indentation stop at the cursor / unindent | `Tab` / `Shift+Tab` |
| Insert a tab character (whatever the indentation setting) | `Ctrl+Alt+I` |
| Leave the editor with the keyboard (Tab moves the focus on) | `Esc`, then `Tab`; or `Ctrl+M` switches this on and off |
| Comment / uncomment | `Ctrl+/` |

With several cursors, everything you type, delete or paste happens at every cursor. `Esc` returns to one cursor.

The buttons ↩ (word wrap), · (show spaces and tabs), A− and A+ (font size) change the view; the editor remembers
these settings.

Every document has its own undo history: ↶ and ↷ in the toolbar, or `Ctrl+Z` and `Ctrl+Y` / `Ctrl+Shift+Z`.

**Spelling:** with a language chosen in the **ABC** selector of the header, unknown words are underlined – in plain text and
Markdown everywhere, in program code only in comments and strings; right-click a word for suggestions ([Spelling](../user-guide.md#spelling)).

## Split view

**◫** shows the current document a second time, next to the first one (one above the other on phones), for example to
look at the beginning of a long file while editing its end. Both views edit the same text and share one undo history;
the second view follows the active tab. ◫ again closes it.

## Find in files

**🔍🗂** (`Ctrl+Shift+F`) searches all open documents at once: matches are listed by file with line and column; a click
opens the document and selects the match. **Aa** matches upper/lower case exactly, **.\*** treats the text as a regular
expression. In Chrome and Edge, **📁 Folder…** searches a folder on your computer instead, with its subfolders (skipping
`.git`, `node_modules`, binary files and files over 5 MB); a click on a match opens that file. At most 2000 matches are
listed.

## Comparing

**⇔** compares the current document with another open document or with a file. On wide screens the two texts are
shown side by side – left the other text (read-only), right the current document – with changed lines and words
highlighted and unchanged parts aligned (the changed lines are found line by line, like `diff` or `git` do, and in them
the changed words – also in long texts with many changes); **→** between them copies a change of the left text into the document. On phones
one view shows the deleted lines inline with **Accept**/**Reject** for each change. **↑**/**↓** jump between the
differences; **Done** (or ⇔ again) ends the comparison, and edits made meanwhile become one undo step.

## Tools

**🛠 Tools** in the toolbar changes the selected text, or the whole document when nothing is selected. Every tool can
be undone with `Ctrl+Z`.

| Group | Tools |
|---|---|
| Lines | sort A→Z or Z→A (numbers in natural order: 9 before 10; upper/lower case ignored), sort by length, reverse the order, remove duplicate lines, remove empty lines, trim whitespace at the end or at both ends, join lines |
| Case | UPPER CASE, lower case, Title Case, iNVERT cASE |
| Encode / decode | Base64 (UTF-8), URL encoding (percent encoding), HTML entities |
| Format | format (indent) or minify JSON, format XML, format SQL, SQL on one line |

Line tools always work on whole lines: those touched by the selection. Invalid input (for example broken JSON) shows
a message and leaves the text unchanged.

**Format SQL…** works like the PoorSQL formatter: every clause on its own line, lists and sub-queries indented,
keywords, function names and data types in UPPER CASE. A dialog sets the options, with a preview of the result:
dialect (standard SQL, T-SQL/SQL Server, PostgreSQL, MySQL, MariaDB, SQLite, Oracle PL/SQL, Db2, DuckDB, BigQuery,
Snowflake, Redshift, Spark, Hive, Trino), case of the keywords (upper, lower, as written), indentation (2 or 4 spaces,
tab), layout (standard, or keywords in a column of their own, left- or right-aligned), AND/OR at the start or end of
the line, the width up to which parentheses stay on one line, and the blank lines between statements. The options are
remembered. **SQL on one line** removes comments (optimizer hints `/*+ … */` stay) and line breaks; strings and quoted
names stay unchanged.

## Colours in the text

A small square in the colour stands in front of every hexadecimal colour (`#6cf`, `#6cff`, `#66ccff`, `#66ccffff`; in plain
text and Markdown not in front of all-digit forms such as issue numbers `#123`). A click on it opens the colour picker of the
suite: the colour in the text changes while you pick, **OK** makes it one step that `Ctrl+Z` undoes, **Cancel** restores it.
The colour keeps its form – short or long, upper or lower case –, and an opacity part is added or removed as needed.

## SAS programs

Files ending in `.sas` are highlighted as SAS: statements, procedure names, functions and CALL routines, macro
statements (`%let`, `%macro` …), macro variables (`&name.`), formats (`date9.`), strings with their suffixes
(`'01jan2024'd`), both kinds of comments (`/* … */` and `* … ;`) and the lines of DATALINES/CARDS blocks. Lines inside
DATA and PROC steps, DO blocks and macros are indented automatically; `run;`, `quit;`, `end;` and `%mend;` move back.

**Code completion** offers what fits where you type: procedure names after `PROC`, CALL routines after `CALL`, macro
statements and functions after `%`, macro variables after `&` (those of `%let`, `%global`, `%local`, `call symputx` and
macro parameters in the program, plus the automatic ones such as `&sysdate9`), and otherwise statements, functions and
the names used in the program (data sets, variables). Suggestions follow the case you type (`PROC PR` → `PRINT`).
`Ctrl+Space` opens the list at any time; `Enter` takes a suggestion, `Esc` closes the list.

## Status bar

The status bar shows the cursor position (line and column), the length of the selection and the number of
cursors. It also lets you change:

- **Language** of the syntax highlighting (detected from the file name).
- **Encoding** used when saving: UTF-8 (optionally with BOM), UTF-16 LE/BE or Windows-1252. When opening, the
  encoding is detected automatically. If a file was detected wrongly, **Reload with encoding** reads it again with
  another encoding (Chrome/Edge on the desktop).
- **Line endings** used when saving: LF (Linux, macOS), CRLF (Windows) or CR.
- **Indentation**: 2, 4 or 8 spaces, or tabs (shown 2, 4 or 8 characters wide). It is detected when a file is opened;
  the last choice is used for new documents. `Tab` indents with it; `Ctrl+Alt+I` always inserts a tab character.

> **Note:** Windows-1252 cannot store all characters. The editor warns before it replaces such characters with “?”.

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Files

| Keys | Function |
|---|---|
| `Ctrl+O` | Open |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save as |
| `Alt+N` | New document |
| `Alt+W` | Close the document |

### Editing

| Keys | Function |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+F` | Find and replace |
| `Ctrl+Shift+F` | Find in all open files |
| `Ctrl+G` | Go to line |
| `Ctrl+D` | Select the next occurrence of the word |
| `Ctrl+Click` | Add a cursor |
| `Alt+Drag` | Column of cursors (rectangular selection) |
| `Esc` | Back to one cursor |
| `Tab` / `Shift+Tab` | Indent / unindent |
| `Ctrl+Alt+I` | Insert a tab character |
| `Esc`, `Tab` / `Ctrl+M` | Move the focus out of the editor / Tab moves the focus (on/off) |
| `Ctrl+/` | Comment / uncomment |
| `Ctrl+Shift+[` / `Ctrl+Shift+]` | Fold / unfold the block |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

The toolbar can be scrolled sideways. Tap the text to show the keyboard. Multiple cursors with `Alt+drag` need a
mouse and keyboard.
