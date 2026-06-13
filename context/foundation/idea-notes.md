## TablePlaner - MVP

### Główny problem
Para młoda z listą 100–150 gości musi ułożyć plan miejsc przy stołach — nie tylko kto przy którym stole, ale konkretnie kto obok kogo siedzi. Musi uwzględnić konflikty, preferencje i różne kształty stołów (okrągłe i prostokątne/podłużne). Dziś robi to na karteczkach lub w Excelu, bez żadnej walidacji sąsiedztw. 

### Najmniejszy zestaw funkcjonalności
- Rejestracja i logowanie użytkownika
- Role: właściciel, współedytor, obserwator - Para może zaprosić świadków lub rodziców przez e-mail. Trzy poziomy uprawnień: właściciel (pełny dostęp + zarządzanie rolami), współedytor (pełny dostęp do danych), obserwator (tylko podgląd)
 - CRUD gości - Imię, nazwisko, strona (panna młoda / pan młody), grupa (rodzina / przyjaciele / współpracownicy), tagi (dieta, mobilność, dzieci). Lista konfliktów - pary gości których nie należy sadzać obok siebie. Lista preferencji - kto koło kogo ma siedzieć
- Nazwa, kształt (okrągły / prostokątny), liczba miejsc. Aplikacja automatycznie generuje ponumerowane miejsca i oblicza relacje sąsiedztwa na podstawie kształtu
- Sadzanie gości na konkretne miejsca - Każdy gość może być przypisany tylko do jednego miejsca. Lista nieprzypisanych gości zawsze widoczna obok.
- Walidacja sąsiedztwa w czasie rzeczywistym
- Widok podsumowania - Każdy stół z wizualizacją miejsc i przypisanych gości, lista aktywnych alertów. Możliwość eksportu do PDF.

### Co NIE wchodzi w zakres MVP
- Wizualny plan sali (drag & drop mebli)
- Drag & drop między stołami - Przeciąganie gości z jednego stołu na drugi. Na MVP: zwolnij miejsce → przypisz na innym stole
- Automatyczne sugestie rozmieszczenia
- Logowanie przez Google / Facebook
- Import gości z CSV / Excel

### Kryteria sukcesu
- Sąsiedztwo działa poprawnie dla obu kształtów — stół okrągły: pierścień (miejsce 1 sąsiaduje z N). Prostokątny: dwa rzędy, sąsiedzi obok i naprzeciwko. Konflikty flagowane tylko między sąsiadami, nie między dowolnymi osobami przy stole.
- Walidacja w czasie rzeczywistym