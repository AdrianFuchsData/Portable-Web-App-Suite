"""Ein kleines Python-Programm: Syntaxhervorhebung, Einklappen (die Pfeile am Rand) und Code-Vervollständigung (Strg+Leertaste)."""
from dataclasses import dataclass


@dataclass
class Artikel:
    name: str
    preis: float
    anzahl: int = 1

    def summe(self) -> float:
        return self.preis * self.anzahl


def bericht(artikel):
    # Tab rückt ein, Umschalt+Tab rückt aus; Strg+Alt+I fügt ein Tabulatorzeichen ein
    for a in sorted(artikel, key=lambda a: a.summe(), reverse=True):
        print(f"{a.name:<10} {a.summe():8.2f}")


if __name__ == "__main__":
    bericht([Artikel("Äpfel", 0.4, 12), Artikel("Brot", 2.9), Artikel("Kaffee", 7.5, 2)])
