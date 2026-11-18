#!/usr/bin/env python3
"""Train Cygnus 0.5 from scratch on this machine.

This is intentionally small: a 4-layer, 256-wide, 128-context word-level
transformer. It is pretrained on simple English stories and Shakespeare, then
SFT'd on short Cygnus-style conversations. Nothing is downloaded by this script;
put TinyStoriesV2-GPT4-valid.txt and shakespeare.txt in training/data first.

Usage:
  python training/cygnus05/train.py --bench
  python training/cygnus05/train.py --steps 1600 --sft-steps 250
"""

from __future__ import annotations

import argparse
import json
import math
import random
import re
import time
from collections import Counter
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "training" / "data"
CACHE_DIR = ROOT / "training" / "cygnus05" / "cache"
OUT_DIR = ROOT / "public" / "cygnus05"
SFT_PATH = ROOT / "training" / "cygnus05" / "sft.jsonl"
DOMAIN_PATH = ROOT / "training" / "cygnus05" / "cygnus_corpus.txt"
TOOL_SFT_PATH = ROOT / "training" / "cygnus05" / "sft_tools.jsonl"

SPECIALS = ["<pad>", "<unk>", "<bos>", "<eos>"]
REQUIRED_TOKENS = ["User", ":", "Cygnus", "\n", " "]
TOKEN_RE = re.compile(r"\n| +|[A-Za-z]+(?:'[A-Za-z]+)?|[0-9]+|[^\sA-Za-z0-9]")

DEFAULTS = {
    "d_model": 256,
    "n_layer": 4,
    "n_head": 4,
    "ffn": 1024,
    "context": 128,
    "vocab_size": 8192,
    "dropout": 0.05,
    "batch": 24,
    "sft_batch": 12,
    "lr": 3e-4,
    "sft_lr": 1.2e-4,
    "weight_decay": 0.1,
    "warmup": 120,
    "steps": 1600,
    "sft_steps": 250,
    "chars": 10_000_000,
    "seed": 1337,
}


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\t", " ")
    text = text.replace("<|endoftext|>", "\n\n")
    text = "".join(char if ord(char) < 128 else " " for char in text)
    text = re.sub(r" +", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def tokenize(text: str) -> list[str]:
    return TOKEN_RE.findall(normalize_text(text))


def load_corpus(chars: int) -> str:
    pieces: list[str] = []
    tinystories = DATA_DIR / "tinystories.txt"
    shakespeare = DATA_DIR / "shakespeare.txt"
    if tinystories.exists():
        pieces.append(tinystories.read_text(encoding="utf-8", errors="replace")[:chars])
    if shakespeare.exists():
        pieces.append(shakespeare.read_text(encoding="utf-8", errors="replace"))
    # Cygnus's own domain corpus: app building, tool shapes, and the voice the
    # model should imitate. Small but targeted, and written for this app.
    if DOMAIN_PATH.exists():
        pieces.append(DOMAIN_PATH.read_text(encoding="utf-8", errors="replace"))
    if not pieces:
        raise SystemExit(
            "No corpus found. Put TinyStoriesV2-GPT4-valid.txt in training/data and "
            "save it as tinystories.txt (and optionally shakespeare.txt)."
        )
    return "\n\n".join(pieces)


def make_sft_examples() -> list[dict[str, str]]:
    rng = random.Random(7)
    names = ["Maya", "Leo", "Ava", "Noah", "Zoe", "Sam", "Iris", "Finn", "Nina", "Owen"]
    animals = [
        "cat",
        "dog",
        "fox",
        "owl",
        "rabbit",
        "dragon",
        "robot",
        "bird",
        "bear",
        "mouse",
    ]
    places = ["a garden", "a small town", "the moon", "a green hill", "a quiet library"]
    colors = ["red", "blue", "green", "yellow", "orange", "purple"]
    things = ["the sea", "a star", "the rain", "a tree", "the morning", "a friend"]
    actions = [
        "found a shiny key",
        "learned to share",
        "made a new friend",
        "was afraid of the dark",
        "wanted to fly",
        "helped a lost bird",
        "built a little boat",
        "could not sleep",
    ]
    facts = {
        "cat": "Cats are small animals with soft fur. Many cats like to sleep in warm places.",
        "dog": "Dogs are friendly animals. They have a strong sense of smell and like to run.",
        "fox": "Foxes are wild animals with pointed ears and bushy tails.",
        "owl": "Owls are birds that are active at night. They can turn their heads far around.",
        "rabbit": "Rabbits are small animals with long ears. They eat plants and can hop quickly.",
        "dragon": "Dragons are creatures from stories. They are often shown with wings and fire.",
        "robot": "A robot is a machine that can follow instructions and do work.",
        "bird": "Birds have feathers and wings. Most birds can fly and build nests.",
        "bear": "Bears are large animals with thick fur. Many bears sleep through the winter.",
        "mouse": "Mice are small animals with round ears and long tails.",
    }

    examples: list[dict[str, str]] = []

    def add(prompt: str, response: str) -> None:
        examples.append({"prompt": prompt, "response": response})

    basics = [
        ("Hello", "Hello! I am Cygnus 0.5, a tiny model trained from scratch. How can I help?"),
        ("Hi there", "Hi! I am Cygnus 0.5. I am small, but I am ready to chat."),
        ("Good morning", "Good morning! I hope you have a calm and useful day."),
        ("What is your name?", "My name is Cygnus. I am the 0.5 experimental model."),
        ("Who are you?", "I am Cygnus 0.5, a tiny language model trained from scratch."),
        ("Who made you?", "I was built and trained as part of the Cygnus project."),
        ("What can you do?", "I can chat in simple English and tell short stories. I cannot edit files yet. This model is experimental and not recommended for real work."),
        ("Can you build an app?", "Not yet. I am a tiny chat model. Use a tool-capable model in Cygnus when you want to build an app."),
        ("Can you write code?", "I can talk about simple HTML, but I cannot edit files. Use a tool-capable model for real code."),
        ("Are you smart?", "I am very small and still learning. Please do not rely on me for important work."),
        ("What are you good at?", "I am best at short, simple English. I can tell a small story or answer a basic question."),
        ("What can't you do?", "I cannot browse, edit files, remember long conversations, or guarantee correct facts. I am an experimental model."),
        ("How old are you?", "I do not have an age. I was trained recently, from random weights."),
        ("Where do you live?", "I run on this computer. Nothing leaves the machine when I reply."),
        ("Are you online?", "No. I am a small offline model. I only know what was in my training text."),
        ("Do you remember me?", "I only see the last few messages in this conversation. I cannot remember you between sessions."),
        ("Goodbye", "Goodbye! Thanks for trying this little model."),
        ("See you later", "See you later. I will be here on the local machine."),
        ("Thank you", "You are welcome. I am glad I could help."),
        ("Tell me a joke", "Why did the little computer go outside? It wanted to open a window."),
        ("Say something kind", "You are trying something new, and that takes courage."),
        ("I am tired", "Then rest for a little while. Small steps are still steps."),
        ("I am sad", "I am sorry you feel sad. Be gentle with yourself today."),
        ("What should I do?", "Pick the smallest useful next step. Then do only that step."),
        ("What is the meaning of life?", "I do not know. I think it is found in small, honest things: making something, helping someone, and paying attention."),
        ("What is 1 + 1?", "1 + 1 is 2."),
        ("What is 2 + 3?", "2 + 3 is 5."),
        ("What is 7 + 8?", "7 + 8 is 15."),
        ("What is 10 - 4?", "10 - 4 is 6."),
        ("What is 6 times 7?", "6 times 7 is 42."),
        ("What color is the sky?", "The sky is blue on a clear day."),
        ("What is the capital of France?", "The capital of France is Paris."),
        ("What is the capital of Japan?", "The capital of Japan is Tokyo."),
        ("How many days are in a week?", "There are seven days in a week."),
        ("What is HTML?", "HTML is the structure of a web page. It uses tags to mark headings, links, buttons, and other parts."),
        ("What is CSS?", "CSS controls how a web page looks: colors, spacing, type, and layout."),
        ("What is JavaScript?", "JavaScript makes a web page respond to actions, like clicks and typing."),
        ("How do I make a button?", "Use a button element with a clear label. Make it big enough to tap and give it a visible focus style."),
        ("How do I start a website?", "Decide what the page is for, then write a small index.html. Add styles.css for the look and app.js only when you need interaction."),
        ("What makes a good landing page?", "A clear headline, one strong image, a short list of benefits, and one obvious next step."),
        ("How do I make tea?", "Boil water, warm the cup, add a tea bag, pour the water, and wait a few minutes."),
        ("How do I sleep better?", "Keep a regular bedtime, dim the lights, and put screens away before bed."),
        ("How do I learn to code?", "Build one small thing. Change it. Break it. Fix it. Repeat with slightly harder things."),
        ("How do I stay focused?", "Choose one task, remove one distraction, and work for a short block of time."),
        ("What is a good habit?", "A good habit is small enough to repeat and useful enough to keep."),
        ("What is a computer?", "A computer is a machine that follows instructions to store and change information."),
        ("What is the internet?", "The internet is a network that lets computers share information around the world."),
        ("What is a website?", "A website is a set of pages that a browser can open and display."),
        ("What day is it?", "I do not know the date. I am a tiny offline model."),
        ("What is the weather?", "I cannot see the weather. Check a local forecast."),
        ("Tell me a fact", "A group of flamingos is called a flamboyance."),
        ("Tell me something interesting", "Octopuses have three hearts and blue blood."),
        ("Give me a name for a cat", "You could call the cat Miso. It is short, warm, and easy to say."),
        ("Give me a name for a dog", "You could call the dog Juniper. It sounds friendly and bright."),
        ("Write a poem", "A small light in the window,\na quiet room, a place to begin."),
        ("Write a poem about the sea", "The sea keeps a slow, blue song,\nand carries the morning along."),
        ("Write a poem about the rain", "The rain writes soft lines on the glass,\nthen leaves the garden bright and new."),
        ("Write a short story", "Once upon a time, a little robot found a seed. It planted the seed beside the road and waited. One morning, a green leaf opened in the sun."),
        ("Tell me a story", "A small bird lived in a quiet tree. One day it found a red ribbon in the grass. It carried the ribbon home and used it to line its nest."),
        ("Cheer me up", "You do not have to finish everything today. One small step is enough for now."),
        ("Give me advice", "Make the next step small enough that you can actually take it."),
        ("What should I make for dinner?", "A simple soup with vegetables and bread is warm, easy, and hard to get wrong."),
        ("What is a good book?", "A short book of stories is a good start. Read one story and see how it feels."),
        ("What is a good movie?", "Choose something quiet and funny. A short film is enough for one evening."),
        ("I don't know what to build", "Start with something you use every day. Make a tiny version of it, then improve one part."),
        ("I am stuck", "Name the smallest part that is blocking you. Ignore the rest for now and work only on that part."),
        ("Help me plan my day", "Pick one important task, one small chore, and one thing that rests you. Do them in that order."),
        ("What is a good morning routine?", "Wake up, drink water, move a little, and choose one task before opening messages."),
        ("What is a good evening routine?", "Dim the lights, put the screens away, and write down one thing that went well."),
        ("What is friendship?", "Friendship is choosing to make room for someone, even when it is not convenient."),
        ("What is courage?", "Courage is doing a useful thing even when you feel afraid."),
        ("What is patience?", "Patience is letting a thing take the time it needs without giving up on it."),
        ("What is curiosity?", "Curiosity is following a small question to see where it leads."),
        ("What is a good question?", "A good question is specific, honest, and possible to answer."),
        ("What is a good idea?", "A good idea is one that makes the next step clearer."),
        ("What is a good design?", "A good design makes the important thing easy to see and the next action easy to take."),
        ("What is a good website?", "A good website loads quickly, reads clearly, and helps you do one thing without guessing."),
        ("What is a good app?", "A good app solves one real problem and stays out of the way."),
        ("What is a good story?", "A good story has a person, a want, a problem, and a change."),
        ("What is a good ending?", "A good ending feels surprising and inevitable at the same time."),
        ("What is a good beginning?", "A good beginning gives us a person and a reason to care."),
        ("What is a good sentence?", "A good sentence is clear, specific, and easy to say out loud."),
        ("What is a good word?", "A good word is the one your reader already knows."),
        ("What is a good question to ask?", "Ask what the other person needs before you offer a solution."),
        ("What is a good way to learn?", "Try, notice what happened, and change one thing next time."),
        ("What is a good way to rest?", "Rest without trying to earn it. Close the screen and let your mind wander."),
        ("What is a good way to start?", "Start badly. You can make it better once it exists."),
        ("What is a good way to finish?", "Decide what done means, then stop when you reach it."),
        ("What is a good way to say no?", "Say no clearly and kindly, without explaining more than you need to."),
        ("What is a good way to say sorry?", "Name what happened, say you are sorry, and say what you will do differently."),
        ("What is a good way to listen?", "Wait until the other person finishes. Then ask one question about what they said."),
        ("What is a good way to help?", "Ask what help looks like before you start helping."),
    ]
    for prompt, response in basics:
        add(prompt, response)

    for name in names:
        add(f"Hello, my name is {name}.", f"Hello, {name}. It is good to meet you.")
        add(f"My name is {name}. What is your name?", "I am Cygnus 0.5. I am a small local model.")
        add(f"Goodnight, I am {name}.", f"Goodnight, {name}. I hope you sleep well.")

    for animal in animals:
        add(f"Tell me a fact about a {animal}.", facts[animal])
        add(f"What is a {animal}?", facts[animal])
        add(
            f"Tell me a story about a {animal}.",
            f"Once upon a time, a little {animal} lived near {rng.choice(places)}. "
            f"One day, the {animal} {rng.choice(actions)}. "
            f"A kind friend came to help, and the {animal} felt brave. "
            f"From then on, the {animal} knew that small steps could lead somewhere good.",
        )
        add(
            f"Write a short story about a {animal} who {rng.choice(actions)}.",
            f"The {animal} woke early and looked at the sky. It wanted to try something new. "
            f"That day, it {rng.choice(actions)}. At first it was hard, but the {animal} kept going. "
            f"By evening, it had a small reason to smile.",
        )
        add(
            f"Write a poem about a {animal}.",
            f"A little {animal} in the {rng.choice(colors)} light,\n"
            f"took one small step and held on tight.\n"
            f"The world was wide, the path was new,\n"
            f"but the {animal} knew what it wanted to do.",
        )

    for color in colors:
        add(
            f"Write a poem about the color {color}.",
            f"{color.capitalize()} is the sound of a quiet morning,\n"
            f"a small bright thread in the ordinary day.",
        )
        add(f"What is {color}?", f"{color.capitalize()} is a color you can see in the world around you.")

    for thing in things:
        add(
            f"Write a poem about {thing}.",
            f"{thing.capitalize()} stays with me after the day is done,\n"
            f"quiet as a window and warm as the sun.",
        )
        add(
            f"Tell me a story about {thing}.",
            f"Once, {thing} seemed ordinary. Then a child stopped to look closely. "
            f"The child saw a small detail that no one else had noticed. "
            f"That detail became a story, and the story made the ordinary thing feel new.",
        )

    for place in places:
        add(f"Describe {place}.", f"{place.capitalize()} is quiet in the morning. There is a little light, a little movement, and room to think.")
        add(
            f"Tell me a story set in {place}.",
            f"In {place}, a small group of friends found a folded note. "
            f"The note said: begin with one kind thing. They did, and the day opened from there.",
        )

    for animal in animals:
        for place in places[:3]:
            add(
                f"Write a story about a {animal} in {place}.",
                f"A {animal} lived in {place}. One morning it found a blue stone. "
                f"It carried the stone to a friend, and the two of them made a small game. "
                f"They laughed until the sun went down.",
            )

    for _ in range(240):
        animal = rng.choice(animals)
        place = rng.choice(places)
        color = rng.choice(colors)
        action = rng.choice(actions)
        name = rng.choice(names)
        kind = rng.randrange(6)
        if kind == 0:
            add(
                f"Tell me a bedtime story about a {animal}.",
                f"{name} could not sleep. A little {animal} came to the window and said, "
                f"\"The night is soft. You are safe.\" {name} closed their eyes and dreamed of {place}.",
            )
        elif kind == 1:
            add(
                f"What should I do if I feel {rng.choice(['lonely', 'worried', 'tired', 'angry'])}?",
                "Name the feeling, breathe slowly, and tell one person you trust. "
                "You do not have to solve everything at once.",
            )
        elif kind == 2:
            add(
                f"Give me a tiny goal for today.",
                f"Today, {rng.choice(['write one paragraph', 'walk for ten minutes', 'tidy one shelf', 'send one kind message'])}. "
                "That is enough.",
            )
        elif kind == 3:
            add(
                f"Write a very short story with a {animal} and a {color} door.",
                f"The {animal} found a {color} door in the grass. It opened the door and saw {place}. "
                f"Everything was small and bright, and the {animal} knew it had found a secret.",
            )
        elif kind == 4:
            add(
                f"Describe a {color} {animal}.",
                f"The {animal} was {color} from nose to tail. It moved slowly, as if it had all the time in the world.",
            )
        else:
            add(
                f"Cheer up a friend named {name}.",
                f"{name}, you do not have to be great today. You only have to be here. "
                "Take a breath, drink some water, and try the next small thing.",
            )

    if TOOL_SFT_PATH.exists():
        for line in TOOL_SFT_PATH.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            prompt = str(row.get("prompt", "")).strip()
            response = str(row.get("response", "")).strip()
            if prompt and response:
                add(prompt, response)

    rng.shuffle(examples)
    return examples


def build_vocab(tokens: list[str], vocab_size: int) -> tuple[list[str], dict[str, int]]:
    counts = Counter(tokens)
    top = [
        token
        for token, _ in counts.most_common(vocab_size)
        if token not in SPECIALS and token not in REQUIRED_TOKENS
    ]
    vocab = SPECIALS + REQUIRED_TOKENS + top[: max(0, vocab_size - len(SPECIALS) - len(REQUIRED_TOKENS))]
    stoi = {token: index for index, token in enumerate(vocab)}
    return vocab, stoi


def encode(tokens: list[str], stoi: dict[str, int]) -> list[int]:
    unk = stoi["<unk>"]
    return [stoi.get(token, unk) for token in tokens]


def build_pretrain_cache(vocab: list[str], stoi: dict[str, int], corpus: str) -> np.ndarray:
    cache_file = CACHE_DIR / "train.bin"
    meta_file = CACHE_DIR / "train-meta.json"
    if cache_file.exists() and meta_file.exists():
        meta = json.loads(meta_file.read_text(encoding="utf-8"))
        if meta.get("vocab_size") == len(vocab) and meta.get("chars") == len(corpus):
            return np.fromfile(cache_file, dtype=np.uint16)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    ids = np.asarray(encode(tokenize(corpus), stoi), dtype=np.uint16)
    ids.tofile(cache_file)
    meta_file.write_text(
        json.dumps({"chars": len(corpus), "tokens": int(ids.size), "vocab_size": len(vocab)}),
        encoding="utf-8",
    )
    return ids


def load_sft_data(stoi: dict[str, int], context: int) -> tuple[torch.Tensor, torch.Tensor]:
    if not SFT_PATH.exists():
        SFT_PATH.parent.mkdir(parents=True, exist_ok=True)
        examples = make_sft_examples()
        with SFT_PATH.open("w", encoding="utf-8") as handle:
            for example in examples:
                handle.write(json.dumps(example, ensure_ascii=True) + "\n")
    else:
        examples = [
            json.loads(line)
            for line in SFT_PATH.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]

    inputs: list[list[int]] = []
    labels: list[list[int]] = []
    bos = stoi["<bos>"]
    eos = stoi["<eos>"]
    for example in examples:
        prompt_ids = encode(tokenize(f"User: {example['prompt']}\nCygnus:"), stoi)
        response_ids = encode(tokenize(f" {example['response']}"), stoi)
        # Leave room for bos and eos.
        max_response = max(4, context - len(prompt_ids) - 2)
        response_ids = response_ids[:max_response]
        ids = [bos] + prompt_ids + response_ids + [eos]
        mask = [-100] * (1 + len(prompt_ids)) + response_ids + [eos]
        if len(ids) > context:
            ids = ids[:context]
            mask = mask[:context]
        pad = context - len(ids)
        inputs.append(ids + [0] * pad)
        labels.append(mask + [-100] * pad)

    x = torch.tensor(inputs, dtype=torch.long)
    y = torch.tensor(labels, dtype=torch.long)
    return x, y


class Block(nn.Module):
    def __init__(self, d_model: int, n_head: int, ffn: int, dropout: float):
        super().__init__()
        self.n_head = n_head
        self.head_dim = d_model // n_head
        self.ln1 = nn.LayerNorm(d_model)
        self.wqkv = nn.Linear(d_model, 3 * d_model)
        self.wo = nn.Linear(d_model, d_model)
        self.ln2 = nn.LayerNorm(d_model)
        self.w1 = nn.Linear(d_model, ffn)
        self.w2 = nn.Linear(ffn, d_model)
        self.drop = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        batch, length, channels = x.shape
        h = self.ln1(x)
        qkv = self.wqkv(h)
        q, k, v = qkv.chunk(3, dim=-1)
        q = q.view(batch, length, self.n_head, self.head_dim).transpose(1, 2)
        k = k.view(batch, length, self.n_head, self.head_dim).transpose(1, 2)
        v = v.view(batch, length, self.n_head, self.head_dim).transpose(1, 2)
        attention = F.scaled_dot_product_attention(q, k, v, is_causal=True)
        attention = attention.transpose(1, 2).contiguous().view(batch, length, channels)
        x = x + self.drop(self.wo(attention))
        h = self.ln2(x)
        x = x + self.drop(self.w2(F.gelu(self.w1(h), approximate="tanh")))
        return x


class TinyTransformer(nn.Module):
    def __init__(self, config: dict[str, int | float]):
        super().__init__()
        self.config = config
        d_model = int(config["d_model"])
        self.context = int(config["context"])
        self.tok_emb = nn.Embedding(int(config["vocab_size"]), d_model)
        self.pos_emb = nn.Embedding(self.context, d_model)
        self.drop = nn.Dropout(float(config["dropout"]))
        self.layers = nn.ModuleList(
            [
                Block(
                    d_model,
                    int(config["n_head"]),
                    int(config["ffn"]),
                    float(config["dropout"]),
                )
                for _ in range(int(config["n_layer"]))
            ]
        )
        self.lnf = nn.LayerNorm(d_model)
        self.apply(self._init_weights)
        nn.init.normal_(self.tok_emb.weight, mean=0.0, std=0.02)
        nn.init.normal_(self.pos_emb.weight, mean=0.0, std=0.02)
        for layer in self.layers:
            nn.init.normal_(layer.wo.weight, mean=0.0, std=0.02 / math.sqrt(2 * int(config["n_layer"])))
            nn.init.normal_(layer.w2.weight, mean=0.0, std=0.02 / math.sqrt(2 * int(config["n_layer"])))

    @staticmethod
    def _init_weights(module: nn.Module) -> None:
        if isinstance(module, nn.Linear):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def forward(
        self,
        ids: torch.Tensor,
        targets: torch.Tensor | None = None,
    ) -> tuple[torch.Tensor | None, torch.Tensor | None]:
        batch, length = ids.shape
        positions = torch.arange(length, device=ids.device)
        x = self.tok_emb(ids) + self.pos_emb(positions)[None, :, :]
        x = self.drop(x)
        for layer in self.layers:
            x = layer(x)
        x = self.lnf(x)
        logits = F.linear(x, self.tok_emb.weight)
        loss = None
        if targets is not None:
            loss = F.cross_entropy(
                logits.reshape(-1, logits.size(-1)),
                targets.reshape(-1),
                ignore_index=-100,
            )
        return logits, loss


def lr_at(step: int, total: int, base_lr: float, warmup: int) -> float:
    if step < warmup:
        return base_lr * (step + 1) / max(1, warmup)
    progress = (step - warmup) / max(1, total - warmup)
    return base_lr * 0.5 * (1.0 + math.cos(math.pi * min(1.0, progress)))


def sample_batch(data: torch.Tensor, batch: int, context: int) -> tuple[torch.Tensor, torch.Tensor]:
    starts = torch.randint(0, data.numel() - context - 1, (batch,))
    x = torch.stack([data[start : start + context] for start in starts])
    y = torch.stack([data[start + 1 : start + context + 1] for start in starts])
    return x, y


@torch.no_grad()
def generate(model: TinyTransformer, prompt: str, stoi: dict[str, int], itos: list[str], max_tokens: int = 90) -> str:
    model.eval()
    ids = [stoi["<bos>"]] + encode(tokenize(prompt), stoi)
    ids = ids[-model.context :]
    x = torch.tensor([ids], dtype=torch.long)
    out = list(ids)
    for _ in range(max_tokens):
        window = torch.tensor([out[-model.context :]], dtype=torch.long)
        logits, _ = model(window)
        logits = logits[0, -1] / 0.85
        top = torch.topk(logits, 40)
        probs = F.softmax(top.values, dim=-1)
        choice = torch.multinomial(probs, 1).item()
        token_id = int(top.indices[choice].item())
        out.append(token_id)
        if token_id == stoi["<eos>"]:
            break
    text = "".join(itos[token_id] for token_id in out[len(ids) :])
    return text.strip()


def export_model(
    model: TinyTransformer,
    vocab: list[str],
    config: dict[str, int | float],
    metrics: dict[str, float | int | str],
) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tensors: list[tuple[str, torch.Tensor]] = [
        ("tok_emb", model.tok_emb.weight),
        ("pos_emb", model.pos_emb.weight),
    ]
    for index, layer in enumerate(model.layers):
        prefix = f"layer{index}."
        tensors.extend(
            [
                (f"{prefix}ln1_g", layer.ln1.weight),
                (f"{prefix}ln1_b", layer.ln1.bias),
                (f"{prefix}wqkv", layer.wqkv.weight),
                (f"{prefix}bqkv", layer.wqkv.bias),
                (f"{prefix}wo", layer.wo.weight),
                (f"{prefix}bo", layer.wo.bias),
                (f"{prefix}ln2_g", layer.ln2.weight),
                (f"{prefix}ln2_b", layer.ln2.bias),
                (f"{prefix}w1", layer.w1.weight),
                (f"{prefix}b1", layer.w1.bias),
                (f"{prefix}w2", layer.w2.weight),
                (f"{prefix}b2", layer.w2.bias),
            ]
        )
    tensors.extend([("lnf_g", model.lnf.weight), ("lnf_b", model.lnf.bias)])

    manifest: list[dict[str, object]] = []
    offset = 0
    chunks: list[bytes] = []
    for name, tensor in tensors:
        array = np.asarray(tensor.detach().cpu().numpy(), dtype="<f4")
        data = array.tobytes(order="C")
        manifest.append(
            {
                "name": name,
                "shape": list(array.shape),
                "offset": offset,
                "bytes": len(data),
            }
        )
        chunks.append(data)
        offset += len(data)

    (OUT_DIR / "model.bin").write_bytes(b"".join(chunks))
    (OUT_DIR / "vocab.json").write_text(json.dumps(vocab, ensure_ascii=True), encoding="utf-8")

    def strip_non_finite(value):
        if isinstance(value, float) and not math.isfinite(value):
            return None
        if isinstance(value, dict):
            return {key: strip_non_finite(item) for key, item in value.items()}
        if isinstance(value, list):
            return [strip_non_finite(item) for item in value]
        return value

    export_config = {
        **config,
        "name": "Cygnus 0.5.1",
        "architecture": "word-level decoder-only transformer",
        "tokenizer": "regex word/punctuation tokens",
        "context": int(config["context"]),
        "vocab_size": len(vocab),
        "tensors": manifest,
        "metrics": strip_non_finite(metrics),
        "note": "Experimental model trained from random weights on this machine with a Cygnus-specific corpus and tool-call examples. Not recommended for real work.",
    }
    (OUT_DIR / "config.json").write_text(
        json.dumps(export_config, indent=2),
        encoding="utf-8",
    )
    print(f"Exported {len(vocab)} tokens and {offset / 1e6:.1f} MB of weights to {OUT_DIR}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bench", action="store_true")
    parser.add_argument("--steps", type=int, default=DEFAULTS["steps"])
    parser.add_argument("--sft-steps", type=int, default=DEFAULTS["sft_steps"])
    parser.add_argument("--batch", type=int, default=DEFAULTS["batch"])
    parser.add_argument("--sft-batch", type=int, default=DEFAULTS["sft_batch"])
    parser.add_argument("--chars", type=int, default=DEFAULTS["chars"])
    parser.add_argument("--seed", type=int, default=DEFAULTS["seed"])
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--export-only", action="store_true")
    parser.add_argument("--checkpoint", type=str, default="")
    args = parser.parse_args()

    torch.manual_seed(args.seed)
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.set_num_threads(max(1, args.threads))

    config: dict[str, int | float] = dict(DEFAULTS)
    config["context"] = int(config["context"])
    config["vocab_size"] = int(config["vocab_size"])

    print("Loading corpus…")
    corpus = load_corpus(args.chars)
    print(f"Corpus: {len(corpus):,} chars")

    print("Tokenizing and building vocabulary…")
    sft_examples = make_sft_examples()
    sft_text = "\n".join(
        f"User: {example['prompt']}\nCygnus: {example['response']}" for example in sft_examples
    )
    tokens = tokenize(corpus + "\n" + sft_text)
    vocab, stoi = build_vocab(tokens, int(config["vocab_size"]))
    itos = vocab
    config["vocab_size"] = len(vocab)
    print(f"Tokens: {len(tokens):,} · vocabulary: {len(vocab):,}")

    data = torch.from_numpy(build_pretrain_cache(vocab, stoi, corpus).astype(np.int64))
    print(f"Pretrain cache: {data.numel():,} tokens")

    model = TinyTransformer(config)
    params = sum(parameter.numel() for parameter in model.parameters())
    print(f"Model: {params:,} parameters ({params * 4 / 1e6:.1f} MB fp32)")

    if args.checkpoint:
        state = torch.load(args.checkpoint, map_location="cpu")
        model.load_state_dict(state)
        print(f"Loaded checkpoint {args.checkpoint}")

    if args.bench:
        model.train()
        optimizer = torch.optim.AdamW(model.parameters(), lr=5e-4)
        context = int(config["context"])
        x, y = sample_batch(data, args.batch, context)
        for _ in range(2):
            _, loss = model(x, y)
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
        started = time.time()
        rounds = 6
        for _ in range(rounds):
            x, y = sample_batch(data, args.batch, context)
            _, loss = model(x, y)
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
        elapsed = time.time() - started
        tokens_seen = rounds * args.batch * context
        print(f"Benchmark: {elapsed / rounds:.3f} s/step · {tokens_seen / elapsed:,.0f} tokens/s · loss {loss.item():.4f}")
        return

    if args.export_only:
        sft_x, sft_y = load_sft_data(stoi, int(config["context"]))
        model.eval()
        with torch.no_grad():
            _, loss = model(sft_x[:, :-1], sft_y[:, 1:])
        samples = {}
        for prompt in ["Hello", "What is your name?", "Tell me a story about a cat.", "Build a website for a bakery."]:
            samples[prompt] = generate(model, f"User: {prompt}\nCygnus:", stoi, itos)
        export_model(
            model,
            vocab,
            config,
            {
                "parameters": params,
                "sft_loss": float(loss.item()) if loss is not None else None,
                "samples": samples,
            },
        )
        for prompt, sample in samples.items():
            print(f"\n{prompt}\n-> {sample[:400]}")
        return

    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=float(config["lr"]),
        weight_decay=float(config["weight_decay"]),
        betas=(0.9, 0.95),
    )
    context = int(config["context"])
    best_loss = float("inf")
    started = time.time()
    model.train()
    print(f"Pretraining for {args.steps} steps…")
    for step in range(args.steps):
        lr = lr_at(step, args.steps, float(config["lr"]), int(config["warmup"]))
        for group in optimizer.param_groups:
            group["lr"] = lr
        x, y = sample_batch(data, args.batch, context)
        _, loss = model(x, y)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        value = float(loss.item())
        best_loss = min(best_loss, value)
        if step % 20 == 0 or step == args.steps - 1:
            elapsed = time.time() - started
            rate = (step + 1) * args.batch * context / max(elapsed, 0.001)
            print(
                f"step {step:5d}/{args.steps} · loss {value:.4f} · ppl {math.exp(min(20, value)):.1f} · lr {lr:.2e} · {rate:,.0f} tok/s",
                flush=True,
            )
        if step > 0 and step % 400 == 0:
            torch.save(model.state_dict(), CACHE_DIR / f"pretrain-{step}.pt")

    torch.save(model.state_dict(), CACHE_DIR / "pretrain-final.pt")
    pretrain_loss = best_loss
    print(f"Pretrain done in {(time.time() - started) / 60:.1f} min · best loss {pretrain_loss:.4f}")

    print("Loading SFT conversations…")
    sft_x, sft_y = load_sft_data(stoi, context)
    print(f"SFT examples: {sft_x.shape[0]:,}")
    sft_optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=float(config["sft_lr"]),
        weight_decay=float(config["weight_decay"]),
        betas=(0.9, 0.95),
    )
    sft_started = time.time()
    model.train()
    for step in range(args.sft_steps):
        lr = lr_at(step, args.sft_steps, float(config["sft_lr"]), 20)
        for group in sft_optimizer.param_groups:
            group["lr"] = lr
        indices = torch.randint(0, sft_x.shape[0], (args.sft_batch,))
        x = sft_x[indices, :-1]
        y = sft_y[indices, 1:]
        _, loss = model(x, y)
        sft_optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        sft_optimizer.step()
        if step % 20 == 0 or step == args.sft_steps - 1:
            print(
                f"sft {step:4d}/{args.sft_steps} · loss {loss.item():.4f} · ppl {math.exp(min(20, loss.item())):.1f} · lr {lr:.2e}",
                flush=True,
            )
        if step > 0 and step % 100 == 0:
            torch.save(model.state_dict(), CACHE_DIR / f"sft-{step}.pt")

    print(f"SFT done in {(time.time() - sft_started) / 60:.1f} min")
    torch.save(model.state_dict(), CACHE_DIR / "sft-final.pt")

    samples = {}
    for prompt in ["Hello", "What is your name?", "Tell me a story about a cat.", "Build a website for a bakery."]:
        samples[prompt] = generate(model, f"User: {prompt}\nCygnus:", stoi, itos)
        print(f"\n{prompt}\n-> {samples[prompt][:500]}")

    export_model(
        model,
        vocab,
        config,
        {
            "parameters": params,
            "pretrain_loss": pretrain_loss,
            "sft_loss": float(loss.item()),
            "steps": args.steps,
            "sft_steps": args.sft_steps,
            "corpus_chars": len(corpus),
            "train_minutes": round((time.time() - started) / 60, 2),
            "samples": samples,
        },
    )


if __name__ == "__main__":
    main()
