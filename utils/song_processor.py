"""
* File name: song_processor.py
* Description:
This script will execute the processing of the lyrics extracted with ppt.py script
The processing will consist of:
    1. Sentiment analysis of the song
    2. Extracting the relevant details of the song in a JSON file.
"""
# IMPORTS
import torch
import json
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from pathlib import Path

def extract_song_title(file_path: Path):
    return Path(file_path).stem

class SongProcessor:
    __tokenizer = AutoTokenizer.from_pretrained("DGurgurov/xlm-r_romanian_sentiment")
    __model = AutoModelForSequenceClassification.from_pretrained("DGurgurov/xlm-r_romanian_sentiment")
    def __init__(self, lyrics: list[str], file_path: Path):
        self.lyrics = ' '.join(lyrics)
        self.song_name = extract_song_title(file_path)
        print(self.song_name)

    @staticmethod
    def analyze_sentiment(lyrics: list[str], file_path: Path):
        """
        Analyze the sentiment of the lyrics using the pre-trained sentiment analysis model
        :return: A string representing the overall sentiment
        """

        song_processor = SongProcessor(lyrics, file_path)

        # Perform sentiment analysis
        inputs = SongProcessor.__tokenizer(song_processor.lyrics, return_tensors="pt", padding=True, truncation=True)

        with torch.no_grad():
            logits = SongProcessor.__model(**inputs).logits

        predicted_class_id = logits.argmax().item()

        sentiment_label = SongProcessor.__model.config.id2label[predicted_class_id]
        print(SongProcessor.__model.config.id2label)
        return sentiment_label

    def classify_song(self, emotion: str, category: str, key: str):
        song_data = {
            "name": self.song_name,
            "lyrics": self.lyrics,
            "emotion": emotion,
            "category": category,
            "key": key,
        }

        # Save the song data to a JSON file
        json_file_path = 'songs_data.json'

        # Check if the file already exists
        if Path(json_file_path).exists():
            with open(json_file_path, 'r', encoding='utf-8') as f:
               existing_data = json.load(f)
        else:
            existing_data = []

        # Add the new song data to the existing list
        existing_data.append(song_data)

        # Save the updated data to the JSON file
        with open(json_file_path, 'w', encoding='utf-8') as f:
            f.write(json.dumps(existing_data, ensure_ascii=False, indent=4))

        print(f"Song '{self.song_name}' classified and saved to {json_file_path}.")


