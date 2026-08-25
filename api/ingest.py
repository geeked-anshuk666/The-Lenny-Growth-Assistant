import os
import re
import yaml
import glob
import asyncio
from sentence_transformers import SentenceTransformer
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text
from database import DATABASE_URL, TranscriptChunkModel, init_db, async_session

# Load sentence transformer model
print("Loading sentence-transformers model...")
model = SentenceTransformer('all-MiniLM-L6-v2')

def timestamp_to_seconds(ts_str: str) -> int:
    """Converts HH:MM:SS or MM:SS to total seconds."""
    parts = list(map(int, ts_str.split(':')))
    if len(parts) == 2: # MM:SS
        return parts[0] * 60 + parts[1]
    elif len(parts) == 3: # HH:MM:SS
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0

def parse_transcript_file(file_path: str):
    """Parses frontmatter and timestamps out of transcript.md."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Parse YAML frontmatter
    frontmatter = {}
    body = content
    if content.startswith('---'):
        parts = content.split('---', 2)
        if len(parts) >= 3:
            try:
                frontmatter = yaml.safe_load(parts[1])
            except Exception as e:
                print(f"Error parsing frontmatter of {file_path}: {e}")
            body = parts[2]

    # Parse speaker turns and timestamps
    # Match lines like "Lenny Rachitsky (00:01:23):" or just "(00:01:23):"
    pattern = re.compile(r'^(?:([^\n(]+)\s*)?\((\d{1,2}:\d{2}(?::\d{2})?)\)\s*:', re.MULTILINE)
    
    turns = []
    matches = list(pattern.finditer(body))
    current_speaker = "Unknown Speaker"
    
    for i, match in enumerate(matches):
        speaker_match = match.group(1)
        if speaker_match and speaker_match.strip():
            current_speaker = speaker_match.strip()
        timestamp = match.group(2).strip()
        start_idx = match.end()
        end_idx = matches[i+1].start() if i + 1 < len(matches) else len(body)
        text_content = body[start_idx:end_idx].strip()
        
        turns.append({
            'speaker': current_speaker,
            'timestamp': timestamp,
            'text': text_content
        })
        
    return frontmatter, turns

def chunk_turns(turns, max_tokens=600):
    """Groups consecutive speaker turns into chunks of ~max_tokens words."""
    chunks = []
    current_chunk_turns = []
    current_word_count = 0
    
    for turn in turns:
        word_count = len(turn['text'].split())
        if current_word_count + word_count > max_tokens and current_chunk_turns:
            # Save current chunk
            chunks.append(current_chunk_turns)
            current_chunk_turns = [turn]
            current_word_count = word_count
        else:
            current_chunk_turns.append(turn)
            current_word_count += word_count
            
    if current_chunk_turns:
        chunks.append(current_chunk_turns)
        
    return chunks

async def ingest_all(episodes_dir: str):
    await init_db()
    
    # Clear existing chunks to avoid duplicates
    print("Clearing existing database transcript chunks...")
    async with async_session() as session:
        await session.execute(text("DELETE FROM transcript_chunks;"))
        await session.commit()
    
    # Search for all transcript.md files
    search_path = os.path.join(episodes_dir, '**', 'transcript.md')
    files = glob.glob(search_path, recursive=True)
    
    print(f"Found {len(files)} transcript files to process.")
    
    for file_path in files:
        print(f"Processing: {file_path}")
        frontmatter, turns = parse_transcript_file(file_path)
        
        guest = frontmatter.get('guest', 'Unknown Guest')
        source_title = frontmatter.get('title', 'Unknown Episode')
        base_url = frontmatter.get('youtube_url', '')
        video_id = frontmatter.get('video_id', '')
        keywords = frontmatter.get('keywords', [])
        
        if isinstance(keywords, str):
            keywords = [k.strip() for k in keywords.split(',')]
            
        if not base_url and video_id:
            base_url = f"https://www.youtube.com/watch?v={video_id}"
            
        chunks = chunk_turns(turns)
        print(f"Split transcript into {len(chunks)} chunks.")
        
        async with async_session() as session:
            for chunk in chunks:
                first_turn = chunk[0]
                ts = first_turn['timestamp']
                seconds = timestamp_to_seconds(ts)
                
                # Append timestamp parameter
                sep = '&' if '?' in base_url else '?'
                source_url = f"{base_url}{sep}t={seconds}" if base_url else ""
                
                # Combine turn texts for embedding
                combined_text = "\n".join([f"{t['speaker']} ({t['timestamp']}): {t['text']}" for t in chunk])
                
                # Generate embedding
                embedding_vector = model.encode(combined_text).tolist()
                
                db_chunk = TranscriptChunkModel(
                    guest=guest,
                    source_title=source_title,
                    source_url=source_url,
                    video_id=video_id,
                    keywords=keywords,
                    chunk_text=combined_text,
                    embedding=embedding_vector
                )
                session.add(db_chunk)
            
            await session.commit()
            print(f"Successfully saved chunks for episode: {source_title}")

if __name__ == '__main__':
    episodes_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'episodes'))
    if not os.path.exists(episodes_path):
        # check current dir
        episodes_path = os.path.abspath('./episodes')
    
    if os.path.exists(episodes_path):
        asyncio.run(ingest_all(episodes_path))
    else:
        print(f"Episodes directory not found at {episodes_path}. Please place transcripts under './episodes' and run again.")
