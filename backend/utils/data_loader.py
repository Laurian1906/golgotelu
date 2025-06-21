import json

def load_song_data(filepath: str):
    """
    Încarcă fișierul JSON cu cântări și returnează o listă de cântări formatată
    frumos pentru Gemini, fără versuri complete.
    """

    with open(filepath, "r", encoding="utf-8") as f:
        raw_data = json.load(f)

    lines = []
    for song in raw_data:
        title = song.get("name") or song.get("title")
        key = song.get("key", "N/A")
        emotion = song.get("emotion", "unknown")
        category = song.get("category", "unknown")
        lyrics = song.get("lyrics", "N/A")

        lines.append(f"🎵 {title}\n - Lyrics: {lyrics}- Key: {key}\n- Emotion: {emotion}\n- Category: {category}\n")

    return "\n".join(lines)
