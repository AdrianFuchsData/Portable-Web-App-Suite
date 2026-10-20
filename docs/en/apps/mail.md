# Mail

The mail client (`mail.html`) reads and writes e-mail like Thunderbird or Outlook: IMAP folders and messages, sending
through SMTP, drafts, an address book and calendar invitations. Without a mail account it opens and writes `.eml` and
`.mbox` files.

Connections to mail servers need the [relay](../user-guide.md#network-functions-and-the-relay). Everything else (files,
composing, contacts) works without it.

## Accounts

1. Open **Relay** in the side bar and enter the relay address and token.
2. Click **+ Account** and enter your e-mail address. Server names (`imap.<domain>`, `smtp.<domain>`) and the user name are
   suggested; correct them with the values of your provider.
3. Choose the security of each server: **SSL/TLS** (ports 993 and 465), **STARTTLS** (ports 143 and 587) or none. If the
   SMTP server needs a different login, untick "Same user name and password as IMAP".
4. **Save and connect**.

The password is only stored with the account if you tick **Save the password with the account**; otherwise the client asks
for it when connecting. Accounts and contacts are kept in the connections file: **Save** it as an encrypted KeePass database
(recommended) or as a JSON file, and open it again next time with **Open…** (see the user guide).

"Accept untrusted certificates" is only meant for servers with self-signed certificates in your own network.

### Several accounts and all inboxes

Click further accounts in the list to connect them as well: every connected account stays connected (● in front of its name,
with the number of unread messages in its inbox), and a click on it shows its folders again without logging in anew. ⏏
disconnects an account.

With two or more connected accounts, **📥 All inboxes** appears above the accounts: the newest messages of every inbox in one
list, newest first, each with the name of its account. Messages can be read, flagged, marked as read or unread and deleted
there (into the trash of their account); **Reply**, **Reply all** and **Forward** write from the account the message belongs
to (signature, sender, its *Sent* folder). The search field filters the combined list; ⟳ reloads it, and it is also updated
when new mail arrives. To move messages into folders, open the account.

## Reading

- Click a folder in the side bar; the number shows unread messages. The newest 50 messages are loaded, **Load older
  messages** loads more. New mail is checked every minute and with **⟳**.
- Click a message to read it. Formatted (HTML) messages are shown without scripts, forms and **remote images** (which are
  often used for tracking); **Plain text** shows the text version. Links open in a new tab.
- Attachments are listed above the text: click one to save it.
- **Search** searches the subject, sender and text of the current folder on the server (press Enter; clear the field to
  return to the folder).
- `Ctrl`+click selects several messages, `Shift`+click a range.
- **🧵** groups the list by **conversation** (on by default): a message and its replies form one row with the number of
  messages (▸ 4), sorted by the newest message; click the number to show the replies, indented below each other.
  Replies are found by their references (as Thunderbird does) and, for clients that drop them, by the subject
  ("Re:", "AW:", "Fwd:" …). Only the loaded messages are grouped; **Load older messages** may add earlier ones.

## Organizing

| Button | Key | Function |
|---|---|---|
| 🗑 Delete | `Delete` | moves to the trash; in the trash, deletes for good |
| ✉̸ | `u` | marks as read/unread |
| ★ | `s` | flags/unflags |
| 📁 | | moves to another folder (or drag the messages onto a folder in the side bar) |
| Save as .eml | | saves the message as a file |
| | `↑` `↓` / `j` `k` | previous/next message |

With an account connected, **＋** above the folders creates a folder; ✎ and × rename and delete the selected folder
(not the standard folders).

### Rules

Under **Rules** in the account settings (✎ next to the account), messages can be sorted automatically: a rule checks
whether **From**, **To** or the **Subject** contains a text (upper/lower case does not matter) and then **moves** the
message to a folder, **flags** it, **marks it as read** or **deletes** it. The first matching rule counts.

Rules work on new, unread messages in the inbox while the mail client is open (when the inbox is opened and when new
mail arrives); they do not run on the server. **⚙** next to the search applies the rules to all messages of the current
folder.

## Writing

**✉ New message** (`n`), **Reply** (`r`), **Reply all** (`a`) and **Forward** (`f`) open the editor:

- Addresses are separated by commas. While you type, matching contacts are suggested (choose with ↑ ↓ and Enter).
  **Bcc** adds a field for blind copies.
- **Formatted (HTML)** switches to rich text with bold, italic, underline, lists, quotes and links; pasted pictures are
  embedded. Otherwise the message is plain text. Your signature from the account is added.
- **📎 Attach…** or dragging files onto the editor adds attachments; forwarding keeps the attachments of the original.
- **Send** sends the message through SMTP and puts a copy into the "Sent" folder. Replied messages are marked ↩.
- **Save draft** stores the message in the "Drafts" folder; open the draft there and click **Edit draft** to continue.
  Without an account, the draft is saved as an `.eml` file.
- **Save as .eml** saves the message as a file (it can be opened again, or sent with another program).
- **Save as template** stores subject and text with the account (named after the subject). Once templates exist,
  **📋 Templates** next to **✉ New message** starts a new message from one; they are removed in the account settings.

**Spelling:** with a language chosen in the **ABC** selector of the header, the subject and the text (plain or formatted)
are checked while you write; right-click an underlined word for suggestions ([Spelling](../user-guide.md#spelling)).

## Contacts

**👤 Contacts** opens the address book: search, add (**+ Contact**), edit (click the name), delete, and write to a contact
(✉). **Import .vcf** reads vCard files (from Outlook, Thunderbird, Android, …), **Export .vcf** saves the (filtered) list
as a vCard file. In a message, **＋👤** next to the sender adds the sender to the contacts. Contacts are saved with the
connections file.

## Calendar invitations

Invitations (iCalendar) show a box with the title, time, place and organizer. **Accept**, **Maybe** and **Decline** send
the answer to the organizer (needs a connected account). **Save .ics** saves the event; open it in the
[calendar](calendar.md) to add it to your calendar file.

## Files without an account

**📂 Open .eml/.mbox** (or dropping files onto the window) opens single messages and mailbox files (exported from
Thunderbird and others). They appear under "Opened files" in the side bar; you can read, search, reply, forward and save
them. With an account connected, 📁 copies them into an IMAP folder.

↗ next to an attachment (**Open with…**) opens it in another application of the suite: attachments of received messages as a copy, attachments of a message being written so that saving replaces the attachment.

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Messages

| Keys | Function |
|---|---|
| `N` | New message |
| `R` / `A` | Reply / reply to all |
| `F` | Forward |
| `Delete` | Delete |
| `U` | Mark as read / unread |
| `S` | Flag |
| `↓` / `J` | Next message |
| `↑` / `K` | Previous message |

### Writing

| Keys | Function |
|---|---|
| `↑` / `↓` / `Enter` / `Tab` | Choose an address suggestion |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

One column is shown at a time: ☰ shows the folders, a message opens full-screen and ← returns to the list. An opened `.eml` file is shown right away. To move a message to
another folder, open it and use 📁 (dragging onto a folder needs the wide layout). The editor uses
the whole screen.

## Limits

- Messages are not stored offline; the client works on the server (IMAP) while connected.
- No OAuth sign-in: providers that only allow OAuth (e.g. Gmail and Microsoft 365 with modern authentication) need an
  app password.
- No encryption or signatures (S/MIME, OpenPGP).
