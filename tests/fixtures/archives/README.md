# Archive test files

The RAR files are test files of [libarchive](https://github.com/libarchive/libarchive) (`libarchive/test/test_read_format_*.rar.uu`,
version 3.7.2, BSD 2-clause licence), decoded from uuencode. RAR archives cannot be created with free tools, so the tests of the
archive manager read these:

| File | Content |
|---|---|
| `rar5_stored.rar` | RAR 5, one stored file `helloworld.txt` |
| `rar.rar` | RAR 4 with a file, a folder and links (`test.txt`, `testlink`, `testdir/test.txt`, …) |
| `rar5_multiple_files.rar` | RAR 5, several compressed files `test1.bin` … |
