# Calendar

The calendar (`calendar.html`) shows and edits calendars in the iCalendar format (`.ics`), the format of Outlook, Thunderbird,
Google Calendar, Apple Calendar and most other calendar programs. Several calendars can be open at the same time.

## Calendars

- **Open…** (`Ctrl+O`) opens one or more `.ics` files; each becomes a calendar in the list on the left. You can also drop `.ics` files onto
  the window. In Chrome/Edge on the desktop, **Recently used** reopens calendars with one click.
- **New calendar** creates an empty calendar.
- The checkbox shows or hides a calendar, the colour field sets its colour, a double-click on the name renames it. A click on the name makes
  it the calendar for new and imported events.
- **Import events…** adds the events of an `.ics` file (e.g. an invitation received by e-mail) to the selected calendar. An event with the same
  UID replaces the existing one, so an updated invitation updates the event.
- 💾 saves a calendar: directly into its file in Chrome/Edge on the desktop, as a download in Firefox and on Android (replace the original file
  with it). **Save all** (`Ctrl+S`) saves every changed calendar; changed calendars are marked with •.

Everything in the file that the calendar does not edit (further reminders, participants, tasks, other properties) is kept when saving.

## Views

| View | Key | Content |
|---|---|---|
| Month | `M` | six weeks; a click on a day number opens the day |
| Week | `W` | time grid of the week with a line for all-day events; the red line is the current time |
| Day | `D` | time grid of one day |
| Agenda | `A` | list of the events of the next 60 days |
| Availability | `F` | free and busy times of the week, one row per calendar (see below) |

**Today** (`T`), ‹ and › (`←`/`→`) navigate; the small month on the left jumps to a date. The week starts on Monday or Sunday (setting at the
bottom left). **Search** (`/`) shows only events whose title, location, description or categories contain the text.

**🖨** prints the current view with the names of the shown calendars and the period as heading (month and week on landscape
sheets, the whole day on one sheet); with "Save as PDF" as the printer you get a PDF. The search applies to the print as well.

### Availability (free/busy)

The **Availability** view helps to find a time that suits several calendars, e.g. your own calendar and the calendars or
free/busy files of colleagues. For every day of the week it shows the working hours with one bar per shown calendar: busy
times in the calendar's colour, tentative events (status "tentative") hatched. Events marked as "free" (transparent) and
cancelled events do not count; all-day events (birthdays, holidays, trips) only count when the file marks them as busy.
The green row **Free** shows the times in which all shown calendars are free for at least the chosen **duration**; the list
below repeats them. A click on a free time opens a new event at that time.

**Working hours** (e.g. 8 to 18), **Duration (min)** and **Weekends** set what is searched; the settings are remembered.
**Export free/busy (.ifb)** saves the busy times of the shown calendars for the next eight weeks as an iCalendar free/busy file
(`VFREEBUSY`) – without titles or other details, so it can be shared to tell others when you are available. Free/busy files
from others (`.ifb`, e.g. published by Outlook or a calendar server) can be opened like calendars; their busy times appear in
the availability view (they have no events for the other views) and are kept unchanged when the calendar is saved.

## Creating and changing events

- **New event** (`N`), a double-click on a day in the month view, or **dragging** over a time range in the week or day view opens the event
  dialog.
- In the week and day views, drag an event to move it (also to another day) and drag its lower edge to change the end. In the month view, drag
  an event to another day.
- A click on an event opens it for editing.

The event dialog contains title, calendar, all day, start and end, time zone, repetition, location, description and categories.
**Export (.ics)** downloads the event as a file, e.g. to send it by e-mail.

### Time zones

New events use the time zone of the computer. An event keeps its time zone; for example, a meeting at 9:00 in New York is shown at the
corresponding local time. Times of events from Outlook with Windows time zone names are converted correctly. "Floating" times have no time zone
and are always shown at the same clock time.

### Repeating events

**Repeat**: daily, weekly (on selected weekdays), monthly (on the same day of the month or, e.g., on the third Monday) or yearly, every n
days/weeks/months/years, ending never, after a number of times or on a date. More complex rules from other programs are shown as
"Custom rule" and kept unchanged.

When you change, move or delete an occurrence of a repeating event, the calendar asks whether to change **only this** occurrence or **all**
occurrences.

**🔔 Reminder** sets a reminder at the start or a time before it (5 minutes to one week); it is stored in the file as an
alarm (`VALARM`), so other calendar programs show it as well. Reminders appear while the calendar is open in the browser:
as a message at the top of the window or, after switching on 🔔 in the toolbar (the browser asks for permission), as a
system notification. A closed page cannot remind you. Reminders that were due more than five minutes before the page
was opened are not shown again.

Undo (↶, `Ctrl+Z`) and redo (↷, `Ctrl+Y`) cover new, changed, moved and deleted events, imports and the name and color of calendars. Opening and closing calendar files are not undone.

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Files

| Keys | Function |
|---|---|
| `Ctrl+O` | Open calendars |
| `Ctrl+S` | Save all calendars |

### Editing

| Keys | Function |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `N` | New event |
| `Esc` | Close the dialog |

### View

| Keys | Function |
|---|---|
| `M` / `W` / `D` / `A` / `F` | Month / week / day / agenda / availability |
| `T` | Today |
| `←` / `K` | Previous |
| `→` / `J` | Next |
| `/` | Search |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

The agenda view is the default; ☰ opens the calendar list and the small month. The other views work as well; in the week view the days are
narrow, so the day view is often more practical.
