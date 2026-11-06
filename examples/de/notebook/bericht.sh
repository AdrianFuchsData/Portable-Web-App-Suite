#!/bin/sh
# Ein kleiner Bericht aus CSV-Daten: im Terminal des Notebooks mit  sh bericht.sh  ausführen
mkdir -p bericht
echo "stadt,produkt,stueck" > bericht/umsatz.csv
echo "Wien,Tee,12" >> bericht/umsatz.csv
echo "Graz,Kaffee,7" >> bericht/umsatz.csv
echo "Wien,Kaffee,20" >> bericht/umsatz.csv
echo "Linz,Tee,5" >> bericht/umsatz.csv
echo "== Stück je Zeile, größte zuerst =="
tail -n +2 bericht/umsatz.csv | sort -t, -k3 -rn
echo "== Zeilen von Wien =="
grep -c Wien bericht/umsatz.csv
echo "== Produkte =="
tail -n +2 bericht/umsatz.csv | cut -d, -f2 | sort | uniq -c
sed -n '2,3p' bericht/umsatz.csv | tr a-z A-Z
