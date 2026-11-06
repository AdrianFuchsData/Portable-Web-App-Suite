-- Tools → Format SQL turns this into readable SQL
select c.name, count(o.id) as orders, sum(o.total) as revenue from customers c left join orders o on o.customer_id = c.id where o.created >= '2026-01-01' group by c.name having count(o.id) > 2 order by revenue desc;
