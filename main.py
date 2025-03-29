# IMPORTS
from pathlib import Path

from utils.file_processors.ppt import PptProcessor
from utils.song_processor import SongProcessor

if __name__ == "__main__":
    path = Path("data/songs-pptx")
    for file in path.iterdir():
        if file.is_file():
            print(file)
            lyrics = PptProcessor.extract_lyrics(file)
            print(lyrics)
            sentiment = SongProcessor.analyze_sentiment(lyrics, file)
            print(sentiment)
            input_emotion = input("Type emotion of this song: ")
            input_category = input("Type category of this song: ")
            input_key = input("Type the key of this song:")

            song_processor = SongProcessor(lyrics, file)
            song_processor.classify_song(emotion=input_emotion, category=input_category, key=input_key)
