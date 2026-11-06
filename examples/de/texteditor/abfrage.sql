-- Werkzeuge → SQL formatieren macht daraus lesbares SQL
select k.name, count(b.id) as bestellungen, sum(b.summe) as umsatz from kunden k left join bestellungen b on b.kunde_id = k.id where b.datum >= '2026-01-01' group by k.name having count(b.id) > 2 order by umsatz desc;
