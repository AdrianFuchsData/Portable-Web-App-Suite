#!/bin/sh
# A small report from CSV data: run it in the notebook's Terminal with  sh report.sh
mkdir -p report
echo "city,product,units" > report/sales.csv
echo "Wien,tea,12" >> report/sales.csv
echo "Graz,coffee,7" >> report/sales.csv
echo "Wien,coffee,20" >> report/sales.csv
echo "Linz,tea,5" >> report/sales.csv
echo "== units per row, largest first =="
tail -n +2 report/sales.csv | sort -t, -k3 -rn
echo "== rows of Wien =="
grep -c Wien report/sales.csv
echo "== products =="
tail -n +2 report/sales.csv | cut -d, -f2 | sort | uniq -c
sed -n '2,3p' report/sales.csv | tr a-z A-Z
