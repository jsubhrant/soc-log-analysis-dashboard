
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const topics = {
  Wildlife: ["Birds", "Mammals", "Reptiles", "Marine Animals", "Dinosaurs", "Wild Cats", "Eagles", "Owls", "Snakes", "Sharks", "Bears"],
  Military: ["Fighter Jets", "Military Helicopters", "Tanks", "Warships", "Submarines", "Special Forces"],
  Sports: ["Cricket Players", "Football Players", "Basketball Players", "F1 Drivers", "Tennis Players", "Boxers"],
  Science: ["Scientists", "Space Missions", "Planets", "Black Holes", "Inventions", "Artificial Intelligence"],
  Intelligence: ["Intelligence Agencies", "Famous Spies", "Cybersecurity Agencies", "Special Operations Units"],
  Entertainment: ["Superheroes", "Anime Characters", "Movie Villains", "Marvel Characters", "DC Characters", "Video Game Characters"],
  Mythology: ["Greek Mythology", "Hindu Mythology", "Norse Mythology", "Egyptian Mythology", "Mythological Gods"],
  Technology: ["Smartphones", "Processors", "Graphics Cards", "Cybersecurity Tools", "Operating Systems"],
  Geography: ["Countries", "Cities", "Mountains", "Rivers", "Deserts", "Islands"],
  History: ["Historical Leaders", "Ancient Civilizations", "Historical Battles", "Empires", "Historical Generals"],
};

type Category = keyof typeof topics;

type Player = {
  id: string;
  player_name: string;
  is_host: boolean;
  credits: number;
};

export default function Home() {
  const [screen, setScreen] = useState("home");
  const [hostName, setHostName] = useState("");
  const [credits, setCredits] = useState("1000");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("Wildlife");
  const [popupOpen, setPopupOpen] = useState(false);

  const [roomCode, setRoomCode] = useState("");
  const [roomId, setRoomId] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);

  const [creatingRoom, setCreatingRoom] = useState(false);
  const [error, setError] = useState("");

  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [isHost, setIsHost] = useState(true);

  const filteredTopics = Object.entries(topics).flatMap(
    ([topicCategory, topicList]) =>
      topicList
        .filter((topic) =>
          topic.toLowerCase().includes(search.toLowerCase())
        )
        .map((topic) => ({
          name: topic,
          category: topicCategory,
        }))
  );

  async function createRoom() {
    if (
      !hostName.trim() ||
      !selectedTopic ||
      !Number.isFinite(Number(credits)) ||
      Number(credits) < 100
    ) {
      setError(
        "Please enter your name, choose a topic, and set at least 100 credits."
      );
      return;
    }

    setCreatingRoom(true);
    setError("");

    try {
      let createdRoom: any = null;
      let lastError: any = null;

      for (let attempt = 0; attempt < 5; attempt++) {
        const code = Math.floor(1000 + Math.random() * 9000).toString();

        const { data, error: roomError } = await supabase
          .from("rooms")
          .insert({
            room_code: code,
            host_name: hostName.trim(),
            topic: selectedTopic,
            starting_credits: Number(credits),
            status: "waiting",
          })
          .select()
          .single();

        if (!roomError && data) {
          createdRoom = data;
          break;
        }

        lastError = roomError;
      }

      if (!createdRoom) {
        throw lastError ?? new Error("Could not create the room.");
      }

      const { error: playerError } = await supabase
        .from("players")
        .insert({
          room_id: createdRoom.id,
          player_name: hostName.trim(),
          credits: Number(credits),
          is_host: true,
        });

      if (playerError) {
        await supabase
          .from("rooms")
          .delete()
          .eq("id", createdRoom.id);

        throw playerError;
      }

      setRoomCode(createdRoom.room_code);
      setRoomId(createdRoom.id);
      setIsHost(true);
      setScreen("lobby");
    } catch (err) {
      console.error("Room creation failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while creating the room."
      );
    } finally {
      setCreatingRoom(false);
    }
  }

  async function joinRoom() {
    const name = joinName.trim();
    const code = joinCode.trim();

    if (!name || !/^\d{4}$/.test(code)) {
      setError("Enter your name and a valid 4-digit room code.");
      return;
    }

    setJoiningRoom(true);
    setError("");

    try {
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("room_code", code)
        .eq("status", "waiting")
        .maybeSingle();

      if (roomError) throw roomError;

      if (!room) {
        throw new Error(
          "Room not found, or the game has already started."
        );
      }

      const { data: existingPlayer, error: existingPlayerError } =
        await supabase
          .from("players")
          .select("id")
          .eq("room_id", room.id)
          .ilike("player_name", name)
          .maybeSingle();

      if (existingPlayerError) throw existingPlayerError;

      if (existingPlayer) {
        throw new Error(
          "A player with that name is already in this room."
        );
      }

      const { error: playerError } = await supabase
        .from("players")
        .insert({
          room_id: room.id,
          player_name: name,
          credits: room.starting_credits,
          is_host: false,
        });

      if (playerError) throw playerError;

      setHostName(room.host_name);
      setSelectedTopic(room.topic);
      setCredits(String(room.starting_credits));
      setRoomCode(room.room_code);
      setRoomId(room.id);
      setIsHost(false);
      setScreen("lobby");
    } catch (err) {
      console.error("Joining room failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while joining the room."
      );
    } finally {
      setJoiningRoom(false);
    }
  }

  // Load players and subscribe to changes for this room.
  useEffect(() => {
    if (screen !== "lobby" || !roomId) return;

    let isActive = true;

    async function loadPlayers() {
      setPlayersLoading(true);

      const { data, error: playersError } = await supabase
        .from("players")
        .select("id, player_name, is_host, credits")
        .eq("room_id", roomId)
        .order("joined_at", { ascending: true });

      if (!isActive) return;

      if (playersError) {
        console.error("Could not load players:", playersError);
        setError("Could not load the player list. Please refresh the page.");
      } else {
        setPlayers((data ?? []) as Player[]);
      }

      setPlayersLoading(false);
    }

    void loadPlayers();

    const channel = supabase
      .channel(`room-players-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void loadPlayers();
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.error("Realtime subscription failed.");
        }
      });

    return () => {
      isActive = false;
      void supabase.removeChannel(channel);
    };
  }, [screen, roomId]);

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {screen === "home" ? (
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">
              The Ultimate Competition
            </p>

            <h1 className="mt-4 text-5xl font-extrabold tracking-tight sm:text-7xl">
              SHOWDOWN
              <span className="block text-cyan-400">ARENA</span>
            </h1>

            <p className="mt-6 text-lg text-slate-300">
              Build your team. Win the auction. Dominate every round.
            </p>

            <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
              <button
                onClick={() => {
                  setError("");
                  setScreen("create");
                }}
                className="rounded-xl bg-cyan-400 px-8 py-4 font-bold text-slate-950 transition hover:bg-cyan-300"
              >
                Create Game
              </button>

              <button
                onClick={() => {
                  setError("");
                  setScreen("join");
                }}
                className="rounded-xl border border-slate-700 px-8 py-4 font-bold transition hover:bg-slate-800"
              >
                Join Game
              </button>
            </div>

            {error && (
              <p className="mt-4 text-sm text-amber-300">{error}</p>
            )}
          </div>
        ) : screen === "create" ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
            <button
              onClick={() => {
                setScreen("home");
                setError("");
              }}
              className="mb-6 text-sm text-cyan-400 hover:text-cyan-300"
            >
              ← Back
            </button>

            <h2 className="text-3xl font-bold">Create a Game</h2>
            <p className="mt-2 text-slate-400">
              Set up your auction room.
            </p>

            <label className="mt-8 block text-sm font-medium">
              Host Name
            </label>
            <input
              value={hostName}
              onChange={(event) => setHostName(event.target.value)}
              placeholder="Enter your name"
              maxLength={30}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-400"
            />

            <label className="mt-6 block text-sm font-medium">
              Starting Credits
            </label>
            <input
              type="number"
              min="100"
              value={credits}
              onChange={(event) => setCredits(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-400"
            />

            <label className="mt-6 block text-sm font-medium">
              Game Topic
            </label>
            <button
              onClick={() => setPopupOpen(true)}
              className="mt-2 flex w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-950 p-4 text-left hover:border-cyan-400"
            >
              <span
                className={
                  selectedTopic ? "text-white" : "text-slate-400"
                }
              >
                {selectedTopic || "Choose a topic"}
              </span>
              <span className="text-cyan-400">⌄</span>
            </button>

            {selectedTopic && (
              <p className="mt-2 text-sm text-cyan-400">
                Selected topic: {selectedTopic}
              </p>
            )}

            {error && (
              <p className="mt-4 break-words text-sm text-red-400">
                {error}
              </p>
            )}

            <button
              onClick={createRoom}
              disabled={
                creatingRoom ||
                !hostName.trim() ||
                !selectedTopic ||
                !Number.isFinite(Number(credits)) ||
                Number(credits) < 100
              }
              className="mt-8 w-full rounded-xl bg-cyan-400 px-6 py-4 font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {creatingRoom ? "Creating Room..." : "Create Room"}
            </button>
          </div>
        ) : screen === "join" ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
            <button
              onClick={() => {
                setScreen("home");
                setError("");
              }}
              className="mb-6 text-sm text-cyan-400 hover:text-cyan-300"
            >
              ← Back
            </button>

            <h2 className="text-3xl font-bold">Join a Game</h2>
            <p className="mt-2 text-slate-400">
              Enter the room code shared by the host.
            </p>

            <label className="mt-8 block text-sm font-medium">
              Your Name
            </label>
            <input
              value={joinName}
              onChange={(event) => setJoinName(event.target.value)}
              placeholder="Enter your name"
              maxLength={30}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-400"
            />

            <label className="mt-6 block text-sm font-medium">
              Room Code
            </label>
            <input
              value={joinCode}
              onChange={(event) =>
                setJoinCode(
                  event.target.value.replace(/\D/g, "").slice(0, 4)
                )
              }
              placeholder="e.g. 4821"
              inputMode="numeric"
              maxLength={4}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-400"
            />

            {error && (
              <p className="mt-4 break-words text-sm text-red-400">
                {error}
              </p>
            )}

            <button
              onClick={joinRoom}
              disabled={
                joiningRoom ||
                !joinName.trim() ||
                joinCode.length !== 4
              }
              className="mt-8 w-full rounded-xl bg-cyan-400 px-6 py-4 font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {joiningRoom ? "Joining Room..." : "Join Room"}
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">
              {isHost ? "Room Created" : "Room Joined"}
            </p>

            <h2 className="mt-4 text-3xl font-bold">Your Lobby</h2>

            <p className="mt-3 text-slate-400">
              {isHost
                ? "Share this 4-digit code with your friends."
                : "You have joined the room."}
            </p>

            <div className="my-8 rounded-2xl border border-cyan-400/30 bg-slate-950 p-6">
              <p className="text-sm text-slate-400">ROOM CODE</p>
              <p className="mt-2 text-6xl font-extrabold tracking-[0.3em] text-cyan-400">
                {roomCode}
              </p>
            </div>

            <div className="space-y-2 text-left text-slate-300">
              <p>
                <span className="text-slate-500">Host:</span>{" "}
                {hostName}
              </p>
              <p>
                <span className="text-slate-500">Topic:</span>{" "}
                {selectedTopic}
              </p>
              <p>
                <span className="text-slate-500">Starting credits:</span>{" "}
                {credits}
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-950 p-5 text-left">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">Players</h3>
                <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-sm font-semibold text-cyan-300">
                  {players.length}{" "}
                  {players.length === 1 ? "player" : "players"}
                </span>
              </div>

              {playersLoading && players.length === 0 ? (
                <p className="mt-4 text-sm text-slate-400">
                  Loading players...
                </p>
              ) : players.length === 0 ? (
                <p className="mt-4 text-sm text-slate-400">
                  No players found yet.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {players.map((player) => (
                    <li
                      key={player.id}
                      className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 font-bold text-cyan-300">
                          {player.player_name.slice(0, 1).toUpperCase()}
                        </div>
                        <span className="font-medium">
                          {player.player_name}
                        </span>
                      </div>

                      {player.is_host && (
                        <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-300">
                          HOST
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="mt-8 rounded-xl bg-slate-800 p-4 text-sm text-slate-400">
              {isHost
                ? "Room saved. Waiting for players to join..."
                : "You joined the room. Waiting for the host to start the game..."}
            </p>

            <button
              onClick={() => setScreen(isHost ? "create" : "home")}
              className="mt-6 text-sm text-cyan-400 hover:text-cyan-300"
            >
              {isHost ? "← Back to setup" : "← Back to home"}
            </button>
          </div>
        )}
      </div>

      {popupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Choose Your Topic</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Select one topic for your game.
                </p>
              </div>

              <button
                onClick={() => setPopupOpen(false)}
                className="rounded-lg px-3 py-2 text-xl text-slate-400 hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search topics..."
              className="mt-5 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-400"
            />

            {!search && (
              <div className="mt-5 flex flex-wrap gap-2">
                {(Object.keys(topics) as Category[]).map((item) => (
                  <button
                    key={item}
                    onClick={() => setCategory(item)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      category === item
                        ? "bg-cyan-400 text-slate-950"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-5 flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(search
                  ? filteredTopics
                  : topics[category].map((name) => ({
                      name,
                      category,
                    }))
                ).map((topic) => (
                  <button
                    key={`${topic.category}-${topic.name}`}
                    onClick={() => {
                      setSelectedTopic(topic.name);
                      setPopupOpen(false);
                      setSearch("");
                    }}
                    className={`rounded-xl border p-4 text-left transition ${
                      selectedTopic === topic.name
                        ? "border-cyan-400 bg-cyan-400/10"
                        : "border-slate-700 bg-slate-950 hover:border-cyan-400"
                    }`}
                  >
                    <span className="block font-semibold">
                      {topic.name}
                    </span>
                    <span className="mt-1 block text-xs text-slate-400">
                      {topic.category}
                    </span>
                  </button>
                ))}
              </div>

              {filteredTopics.length === 0 && (
                <p className="py-8 text-center text-slate-400">
                  No topics found. Try another search.
                </p>
              )}
            </div>

            <button
              onClick={() => setPopupOpen(false)}
              className="mt-5 w-full rounded-xl bg-cyan-400 px-6 py-3 font-bold text-slate-950 hover:bg-cyan-300"
            >
              Confirm Topic
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
