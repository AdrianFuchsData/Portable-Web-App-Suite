#!/bin/sh
# Back up a folder as TAR.GZ and ZIP:  sh backup.sh FOLDER
set -e
FOLDER=${1}
echo "Backing up $FOLDER"
tar -czf $FOLDER-backup.tgz $FOLDER
zip -r -q $FOLDER-backup.zip $FOLDER
ls -l $FOLDER-backup.*
