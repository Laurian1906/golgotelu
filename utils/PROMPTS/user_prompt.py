from utils.data_loader import load_song_data

songs = load_song_data()

USER_PROMPT=f"""
Bună! Alege-mi niște cântări pentru duminica asta te rog!
Ai mai jos toate cântările disponibile, cu titlu, categorie, emoție și gama (key).

songs_data:
{songs}
"""