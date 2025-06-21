/**
 * Api.tsx
 * This file contains functions to interact with the backend API.
 * 
 * Functions:
 * - `generateSongList`: When sent a POST request the AI will generate a song list based on the prompt it got internally.
 */

export async function generateSongList() {
    /**
     * Generates a song list by sending a request to the backend API.
     */

    const url = "http://127.0.0.1:9090/api/generateSongList";

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }

        const json = await response.json();

        console.log(json.response);
        return json.response;

    } catch {
        return "An error occurred while generating the song list. Please try again later.";
    }
}

export async function downloadList() {
    /** 
     * Downloads the generated song list from the backend API.
     */
    return null
}