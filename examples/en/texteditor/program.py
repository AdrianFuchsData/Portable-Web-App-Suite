"""A small Python program: syntax highlighting, folding (the arrows in the margin) and code completion (Ctrl+Space)."""
from dataclasses import dataclass


@dataclass
class Item:
    name: str
    price: float
    count: int = 1

    def total(self) -> float:
        return self.price * self.count


def report(items):
    # Tab indents, Shift+Tab unindents; Ctrl+Alt+I inserts a tab character
    for item in sorted(items, key=lambda i: i.total(), reverse=True):
        print(f"{item.name:<10} {item.total():8.2f}")


if __name__ == "__main__":
    report([Item("Apples", 0.4, 12), Item("Bread", 2.9), Item("Coffee", 7.5, 2)])
