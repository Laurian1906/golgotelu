import os

from utils.data_loader import load_song_data

songs = load_song_data(os.path.join(os.path.dirname(__file__), '..', '..', 'songs_data.json'))

USER_PROMPT=f"""
Bună! Alege-mi niște cântări pentru duminica asta te rog!
Ai mai jos toate cântările disponibile, cu titlu, categorie, emoție și gama (tonalitate).

songs_data:
{songs}
"""