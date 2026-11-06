#!/bin/sh
# Einen Ordner als TAR.GZ und ZIP sichern:  sh sicherung.sh ORDNER
set -e
ORDNER=${1}
echo "Sichere $ORDNER"
tar -czf $ORDNER-sicherung.tgz $ORDNER
zip -r -q $ORDNER-sicherung.zip $ORDNER
ls -l $ORDNER-sicherung.*
