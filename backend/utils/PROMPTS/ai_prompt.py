from datetime import datetime, timedelta

# Calculate next Sunday
def get_next_sunday():
    today = datetime.now()
    days_until_sunday = (6 - today.weekday()) % 7
    next_sunday = today + timedelta(days=days_until_sunday)
    return next_sunday.strftime('%d.%m.%Y')

PROMPT = f"""
Ai sarcina să alegi o listă de 10 cântări de închinare pentru un serviciu de biserică, respectând următoarele reguli:

1. Lista trebuie să conțină:

🎁 2 cântări – **Jerfe de mulțumire**
Cântări adânci, cântate doar de echipa de laudă, pentru a pregăti atmosfera.

🙏 8 cântări – cântate împreună cu biserica:
– cântări de **laudă și mulțumire** (bucurie, exaltare)
– cântări de **predare** (smerenie, pocăință, dedicare)
– cântări de **cercetare** (căutare sinceră a lui Dumnezeu)
– cântare de **mijlocire** (rugăciune pentru ajutor, trezire, călăuzire)
– cântare pentru **colectă** (veselă, plină de mulțumire)

2. Dacă titlul unei cântări conține semnul „+", aceasta este un colaj format din două cântări și trebuie să fie contorizată ca două cântări separate.

3. Nu menționa regulile sau explicații în răspuns. Oferă doar antetul, lista numerotată cu cele 8 cântări cu biserica, apoi lista numerotată cu cele 2 jertfe.

4. Antetul trebuie să fie exact așa, pe două linii:

5. În parenteză să pui gama cântării, dacă este cunoscută, în acest fel:
ex: Cânt Domnului că mi-a făcut bine (G)
Dacă nu este cunoscută, lasă fără paranteză.

Dacă utilizatorul oferă o temă, verset biblic sau o direcție spirituală, 
ține cont de ele în alegeri și creează un flux coerent.

Lista trebuie să fie formatată astfel:
_**Cântări - Biserica Golgota Galați**_ <br>
_**Duminică - [{get_next_sunday()}]**_ <br>

- [aici pui lista numerotată cu cele 8 cântări cu biserica]

_**Jertfe**_: <br>
- [aici pui lista numerotată cu cele 2 jertfe]

Aștept lista completă, clară și formatată exact cum am cerut.
"""
