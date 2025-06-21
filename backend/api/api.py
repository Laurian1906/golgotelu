import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from main import generate_response

app = FastAPI()

origins = [
    "http://localhost:5173"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=[
        "*",
        "Access-Control-Allow-Origin",
    ],
)

@app.get("/")
def root():
    return {"message": "Welcome to the API!"}

@app.get("/api/generateSongList")
def generate_song_list():
    try:
        logging.info("Generating song list...")
        response = generate_response()
        
        if response: 
            logging.info("Song list generated successfully.")
            
        return {"response": response}
    except Exception as e:
        logging.exception("An error occurred while generating the song list: " + str(e))
        raise HTTPException(status_code=500, detail="Internal Server Error")