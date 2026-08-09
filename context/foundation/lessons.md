# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Keep commit descriptions short — summary only, no details

- **Context**: tworzenie commitów git (na końcu pracy nad zadaniem, przez CLI albo `git commit -m`)
- **Problem**: rozbudowane opisy commitów z listą wszystkich szczegółów są trudne do skanowania w `git log` i duplikują to, co widać w diffie — user oczekuje krótkiego podsumowania, nie kroniki pracy
- **Rule**: Twórz opis commita jako krótkie podsumowanie pracy (2–3 linijki maks poza pierwszą). Nie wypisuj szczegółów zmian ani rationale — te informacje żyją w diffie i w powiązanych docs/issues, do których commit powinien się odwoływać co najwyżej krótkim wskazaniem.
- **Applies to**: implement, impl-review
