# Database tool

The database tool (`dbtool.html`) opens **SQLite** database files and connects to **PostgreSQL** servers: browse the schema, write and
run SQL, view and edit table data, export results.

## SQLite databases

- **New SQLite** creates an empty database, **Open SQLite…** (`Ctrl+O`) opens a database file (`.sqlite`, `.db`, …); you can also drop the
  file onto the window. Several databases can be open at the same time (list **Open databases** on the left).
- The database is edited in memory. **Save database** (`Ctrl+S`) writes it back: directly into the file in Chrome/Edge on the desktop,
  as a download in Firefox and on Android (replace the original file with it). Changed databases are marked with •.

SQLite works completely offline.

## PostgreSQL servers

A Postgres server is reached through the **local relay** (see the user guide, "Network functions and the relay").

1. **Connect to Postgres…** opens the connection dialog: name, host, port (5432), database, user, password, SSL (prefer, require, disable;
   optionally accept self-signed certificates) and the relay address and token. **Test** checks the relay.
2. **Connect** opens the connection; **Save connection** adds it to **Saved connections** (the password only if you tick the box).
3. A click on a saved connection connects (or asks for the password if it was not saved); ✎ edits and × deletes a connection.

Password, MD5 and SCRAM-SHA-256 authentication are supported.

### Saving connections

Saved connections and the relay settings are kept in a **connections file**. **Save** in the "Connections" area asks for the format:

- **KeePass database** (encrypted with a password; recommended) — every connection becomes a KeePass entry in the group
  "Portable Web App Suite/dbtool" and can also be seen in KeePass;
- **JSON file** (not encrypted; passwords would be readable).

**Open…** opens such a file again (KeePass asks for the password). The same file can hold the connections of the other suite applications.

## Schema and SQL

- **Schema** lists the tables (▦) and views (👁) of the active database; unfold a table to see its columns (🔑 = primary key, types, NOT NULL).
  ⟳ reloads the schema; it is reloaded automatically after `CREATE`, `ALTER` and `DROP`.
- The SQL editor highlights SQL and completes keywords, table and column names (`Ctrl+Space`).
- **Run** (`Ctrl+Enter`) runs the selected text, or the statement at the cursor; **Run all** (`Ctrl+Shift+Enter`) runs all statements.
- Every statement with a result gets a result tab. The message line shows the number of changed rows, the duration or the error
  (for Postgres with SQL state code, detail and hint).
- **CSV** and **JSON** export the shown result.
- **⛁ ER diagram** (above the schema) draws the tables and views with their columns (🔑 primary key, → foreign key) and the
  foreign-key relations, and opens the drawing in the diagram editor (referenced tables above the referencing ones), where it
  can be arranged, edited, printed or exported.
- **Explain** shows how the database runs the current statement: for SQLite the query plan as a tree (`SCAN` = reads the
  whole table, `SEARCH … USING INDEX` = uses an index), for Postgres the text of `EXPLAIN`.
- **History** in the side bar lists the last statements you ran (failed ones are underlined). A click puts a statement
  back into the editor, a double-click runs it again. The history is kept only in this browser; × deletes it.

## Browsing and editing tables

**Browse** next to a table shows its rows (200 per page, ‹ and › page).

- Double-click a cell to edit it; `Enter` saves, `Escape` cancels, `Ctrl+Delete` sets the value to NULL.
- **Add row** opens a form with a field per column (empty fields use the column's default).
- × deletes a row (after a confirmation).

Editing needs a primary key (SQLite tables without one are edited by their `rowid`). Every change is executed immediately as an
`UPDATE`, `INSERT` or `DELETE` statement, which is shown in the message line.

Undo (↶, `Ctrl+Z` outside the SQL editor) and redo (↷, `Ctrl+Y`): in SQLite databases for every change, also by executed SQL statements (up to 20 steps, for databases up to 32 MiB); on PostgreSQL servers for the changes made in the result table (changed cells, deleted rows). The table is reloaded after undoing.

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Files

| Keys | Function |
|---|---|
| `Ctrl+O` | Open a SQLite file |
| `Ctrl+S` | Save the SQLite file |
| `Ctrl+Shift+S` | Save as |

### SQL

| Keys | Function |
|---|---|
| `Ctrl+Enter` | Run the statement at the cursor (or the selection) |
| `Ctrl+Shift+Enter` | Run all statements |

### Table

| Keys | Function |
|---|---|
| `Enter` | Store the edited cell |
| `Esc` | Cancel editing |
| `Ctrl+Delete` | Set the cell to NULL |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

☰ opens the list of databases, the schema and the saved connections. Results can be scrolled sideways.
