# About

This project provides a suite of standalone web application that can be used
offline (i.e. with no WAN connection), also in very restrictive environments
(like a thin client with only a browser installed).

It provides standard office tools for creating and editing files of diffent
format as well as web tools for serveral protocols:

## File utils
- Text editor similar to Notepad++, with support for code completion, syntax highligting,
  search and replace, multiple documents, and other useful features that you would expect
  from a text editor
- HEX Editor
- Arichve viewer and editor (like 7zip)
- Audio and video playback with support for playlists (like VLC player)
- Audio editor (like Audacity)
- Video editor (like kdenlive)
- Image editor (like paint, GIMP)
- Diagram editor (like draw.io, excalidraw)

## Security
- Keepass database editor
- Authenticator (already built, see https://software.adrianfuchs.at/local-tools/web-authenticator,
  some concepts might be worth carrying over for other apps)

## Office
- Spreadsheet editor (like Excel, Libre Office Calc)
- Document editor (like Word, Libre Office Write)
- Presentation editor (like PowerPoint, Libre Office Impress)
- PDF viewer (like Adobe Reader, Okular)
- Calerdar with support for ical files

## Web utils
- E-mail client application (like Outlook, Evolution or Thunderbird) with support 
  for recieving and sending mails, address books, calendar
- Databese editor and query tool (like DBeaver, squirrel SQL) with support for SQLite and Postgres
- FTP/SFTP client (like FileZilla)
- SSH client (like PuTTY), with options to upload, download files over SSH
- HTTP request analyzer (like Postman)
- Browser wrapper: A browser inside the browser that provides information about the viewed webpage
  (like developer tools, wich might not exist on mobile browsers or might be deactivated by a policy)

## Data science
- Python console and notebook (like Jupyter) with pandas, numpy, matplotlib and other useful
  Python libraries, running completely on the client (based on Pyodide). Notebooks can be
  opened and saved as `.ipynb` files.

All application data (ie. connections, credentials) for the the applications must be
storable locally. The user can decide to save in an unecrypted XML/JSON file or 
encrypted in a keepass database.

On chrome and chromium browsers, opened files can directly be saved.
On firefox (where file handles cannot be kept this way), the files must be downloaded
and the user must be informed to replace the old file by a new one.

The applications are provided as a single HTML files including all dependencies, so it can
run from a local single file system in a browser without internet connection or a server.
It runs on multiple platforms including Windows, Linux and Android.

# Behaviour

# Development and testing

For testing, you can install a python venv with all required dependencies (pykeepass, 
playwright, ...) in the project directory. Make sure to gitignore the venv, however include
a `requirements.txt` file in the repository.

# Documentation

The app suite must be documented thoroughly. Include both a user and a technical
documentation in this repository, both in German and English Language and both in Markdown and
in Confluence storage XHTML format.