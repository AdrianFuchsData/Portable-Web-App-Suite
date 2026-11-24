# Barcodes

The barcode application (`barcode.html`) reads QR codes and other barcodes with the camera or from pictures, and creates
them – for links, Wi-Fi access, contacts, e-mails and any text. Everything runs in the browser; images and contents are
not sent anywhere.

Supported codes: **QR Code**, Micro QR Code, **Data Matrix**, **Aztec**, **PDF417** (2D) and **Code 128**, Code 39,
Code 93, **EAN-13**, EAN-8, UPC-A, UPC-E, ITF and Codabar (1D bar codes). Reading also recognises further formats
(for example DataBar, MaxiCode, rMQR).

## Reading

- **📷 Camera** starts the camera (the browser asks for permission); codes in the picture are marked green and listed
  as soon as they are recognised. **🔄 Switch camera** changes between the cameras of the device; **⏹ Stop camera** ends
  it.
- **🖼 Open image…** (`Ctrl+O`) reads codes from image files (PNG, JPEG, GIF, WebP, BMP, SVG, AVIF). You can also drop
  images onto the window or paste one from the clipboard (`Ctrl+V`), e.g. a screenshot. Several codes in one image are
  found together.
- Every code appears once in the list with its format and its **content type**: link, Wi-Fi, contact (vCard/MeCard),
  e-mail, phone number, SMS, location, one-time password setup (`otpauth://`), calendar event or text. The details
  (e.g. network name and password) are shown below the text.
- Actions: **Copy** the text, **Open link** (only `http`/`https`, in a new tab), copy the Wi-Fi password, **Save
  contact (.vcf)**, **Save event (.ics)**, and **Edit in the generator**, which takes the content to the *Create* tab.

> **Note:** Check links before you open them – a QR code can lead anywhere. The application never opens links by itself.

## Creating

1. Choose the **content**: Text, Link, Wi-Fi, Contact, E-mail, Phone number, SMS or Location, and fill in the fields.
   The text of the code is built from them (e.g. `WIFI:T:WPA;S:Home;P:secret;;` or a vCard); open *Content* below the
   preview to see it.
2. Choose the **format**. For QR codes the **error correction** sets how much of the code may be damaged or covered
   (L 7 %, M 15 %, Q 25 %, H 30 %). 1D codes accept only certain characters (EAN/UPC: digits with the check digit
   calculated) – an example is filled in when you switch to one; an error message explains invalid contents.
3. Set the **module size** (pixels per square or bar), the **quiet zone** (white margin in modules; scanners need it),
   for 1D codes the **bar height**, and the **colours** or a transparent background. Keep dark codes on a light
   background with enough contrast.
4. Text with the code: 1D codes show their digits below the bars (**Text below the bars**); for 2D codes **Show the encoded
   text below the code** adds the content, wrapped to the code's width (long contents are shortened after 12 lines). A
   **Caption** of your own – a name, a price, “Scan me” – goes below or above the code (*Caption position*). The text is
   part of the SVG and PNG, so a label is ready to print.

The preview is read back automatically: **✓ readable** confirms that the code can be scanned. **⬇ SVG** (scalable, for
print) and **⬇ PNG** download the code, **Copy image** puts it on the clipboard, **🖨 Print** prints only the code.

## Batch: many codes at once

**📑 Batch** creates many codes in one go – for example labels for a shelf, tickets or inventory numbers:

- Type or paste the contents, **one code per line**, or **open a CSV or text file**. In a CSV file (comma, semicolon or tab)
  choose the column with the **content** and, if you like, a column with the **caption** (printed with each code) and one
  with the **file name**; tick whether the first row holds the column names. A file with only one column counts as a list.
- The **format** can be chosen here; size, colours, text with the code and the caption (when there is no caption column)
  are those set under **▦ Create**.
- **Result**: a **PDF** sheet of labels (A4 or Letter, columns × rows per page, codes centred in their cells), or a **ZIP**
  with one **PNG** or **SVG** picture per code (named after the file name column, otherwise numbered after the content).

Contents that the format cannot encode (letters for EAN-13, for example) are skipped and listed with their line number; a
ZIP also contains them in `errors.txt`.

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Files

| Keys | Function |
|---|---|
| `Ctrl+O` | Open images and read their codes |
| `Ctrl+V` | Read the code of a pasted image |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

The camera of the back is used first; *Switch camera* changes to the front camera. The generator shows the code above
the form. Downloaded images go to the download folder of the browser.
