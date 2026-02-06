import sqlite3

db_path = "data/memories.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT id, content, memory_type FROM semantic_memories WHERE memory_type='preference' LIMIT 5")
rows = cursor.fetchall()

print("Preference memories in database:")
for row in rows:
    print(f"\nID: {row[0]}")
    print(f"Type: {row[2]}")
    print(f"Content: {row[1]}")

conn.close()
