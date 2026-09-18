---
id: interview-english
deck: vocabulario-entrevista-en
fase: 5
ordem: 6
nivel: 4
tags: [ingles, entrevista, comunicacao, star, system-design]
descricao: Write and speak about your own systems in English — pitch, STAR stories, explaining an architecture out loud, and the words that freeze you mid-sentence. Escrito em inglês de propósito.
---

# Interview English

This course is **written in English on purpose**. You already know the engineering; what freezes you in
an interview is producing it in a second language, live, while thinking. The fix is not more vocabulary
lists — it is **rehearsed structures** you can fall back on when your brain is busy.

Three things you will build here: a **pitch** (90 seconds about you), a set of **STAR stories** about
systems you actually built, and the ability to **explain an architecture out loud** without losing the
thread.

:::objetivo By the end of this course you can
- deliver a 90-second pitch without reciting a memorised paragraph;
- tell a STAR story with a number in it, in under two minutes;
- narrate a system design in English using signposting phrases that buy you thinking time;
- recover from a word you do not know, instead of stopping;
- write a short technical answer that a native reviewer would call clear, not "translated".
:::

:::nota Sem áudio, de propósito
Este módulo não tem exercício de pronúncia nem de escuta — foi decisão do Rafael. O que ele treina é
**produção escrita e estrutura mental**: o que você escreve aqui é exatamente o que você vai falar.
Grave-se lendo, se quiser, mas o app não avalia áudio.
:::

## Talking about yourself

### The 90-second pitch

"Tell me about yourself" is not a biography request. It is a **relevance test**: the interviewer wants
to know why they should keep talking to you. Four beats, roughly 20 seconds each:

1. **Who you are now** — role, stack, scope. *"I'm a full-stack developer; for the last three years I've
   been the whole technology team at a retail company with 30+ stores."*
2. **One thing you own end to end** — pick the most impressive true thing. *"I built and run the internal
   platform: Node APIs, a React dashboard, and the Postgres warehouse behind it."*
3. **A concrete result, with a number** — *"I replaced a spreadsheet-based process that took two days a
   month with a dashboard that refreshes every 15 minutes."*
4. **Why this conversation** — what you're looking for and why it fits.

:::alerta Do not memorise it word for word
A memorised paragraph collapses the moment you're interrupted — and interviewers interrupt. Memorise the
**four beats**, not the sentences. If you lose your place, you can always say *"Sorry, let me back up —"*
and restart the beat, which sounds confident rather than lost.
:::

Useful hedges when you need a second to think: *"That's a good question — let me think for a second."*
*"There are two parts to that."* *"Let me start with the short answer and then expand."* These are not
filler: they are the phrases native speakers use to buy exactly the same time.

:::atividade
id: write-your-pitch
titulo: Write your 90-second pitch
termos: [to-own-a-feature, to-ship, let-me-think-out-loud]
nivel: 3
tempoMin: 25
ambiente: papel
entrega:
  tipo: texto
  rotulo: Your pitch, in English, in four labelled beats
  minimoChars: 500
dicas:
  - Write it in English directly. Translating from Portuguese produces long sentences and passive voice.
  - Each beat should be 2-3 short sentences. If a sentence needs a comma in the middle, split it.
  - The number in beat 3 matters more than the adjectives. Replace "significantly improved" with the number.
criterios:
  - Has all four beats, clearly separated
  - Beat 3 contains at least one concrete number or measurable outcome
  - Sentences are short and active (no long subordinate chains)
  - Beat 4 connects your experience to the role, not just "I want to grow"
  - Reads as written-in-English, not as a translation
---
Write your own 90-second pitch in English, labelling each beat.

Use your real work: the retail platform, the trading bot on the phone, the study app, the WhatsApp
automation. Pick the one that best matches the role you want.

**Checklist before you submit:**

- [ ] Beat 3 has a **number** (time saved, volume handled, uptime, users, percentage)
- [ ] No sentence longer than ~20 words
- [ ] No "I'm responsible for..." three times in a row — vary the verbs
- [ ] Beat 4 says something about **them**, not only about you

The mentor will review grammar, naturalness and structure, and will tell you which beat is weakest.
---
Here is a worked example with the four beats labelled. Yours should be **your** facts, not these.

> **(1) Who I am now.** I'm a full-stack developer working mostly with Node and React. For the past three
> years I've been the entire technology team at a retail company — around thirty stores and a warehouse.
>
> **(2) What I own end to end.** I design, build and operate everything: the internal APIs, the
> dashboards the directors use every morning, the Postgres data layer, and the deployment on our own
> servers with PM2 and Nginx. When something breaks at 7 a.m., I'm the one who fixes it.
>
> **(3) A concrete result.** The one I'm proudest of: the delivery metric used to be assembled by hand
> from spreadsheets, which took about two days every month and was often wrong. I moved it into a
> materialised view refreshed every fifteen minutes, and found a 3.4× error in how the old number was
> calculated. Now it's on a screen, and it's right.
>
> **(4) Why this conversation.** I've been the only engineer for three years, which taught me a lot about
> ownership and very little about working in a team of senior engineers. That's exactly what I'm looking
> for now — and your team works on the kind of data-heavy backend I've been doing alone.

**What makes this work:** short active sentences; one vivid concrete detail per beat ("at 7 a.m.",
"3.4× error"); an honest weakness in beat 4 that is turned into a reason to hire, not an apology. Notice
there are no words like *robust*, *scalable* or *cutting-edge* — interviewers discount adjectives and
remember numbers.
:::

### STAR without sounding like a robot

STAR — Situation, Task, Action, Result — is a **structure**, not a script. The two mistakes are spending
90 % of the time on Situation, and finishing without a Result.

| Beat | Time | What it must contain |
| --- | --- | --- |
| **S**ituation | ~15 s | just enough context: system, scale, what was at stake |
| **T**ask | ~15 s | what *you specifically* had to do (not the team) |
| **A**ction | ~60 s | the decisions **you** made, and why — this is what they're buying |
| **R**esult | ~20 s | a number, plus what you'd do differently |

:::exemplo Result with a number beats Result with an adjective
Weak: *"...and in the end the system was much more stable."*
Strong: *"...and the duplicate purchases went from five a week to zero. We measured it for a month
before I said it was fixed."*
The second one is also a **credibility signal**: you measured before declaring victory.
:::

Prepare **five** stories, not twenty: a production incident, a hard technical decision, a disagreement,
a failure you caused, and something you shipped end to end. Almost every behavioural question maps to
one of those five.

:::atividade
id: star-incident-story
titulo: One incident, told in STAR
termos: [root-cause, postmortem, in-hindsight]
nivel: 4
tempoMin: 30
ambiente: papel
entrega:
  tipo: texto
  rotulo: Your STAR story, in English, with the four beats labelled
  minimoChars: 600
dicas:
  - Pick an incident you actually debugged. Invented stories fall apart under follow-up questions.
  - Spend most of your words on ACTION — that's what they're evaluating.
  - End with "what I'd do differently", even if the result was good. It signals seniority, not doubt.
criterios:
  - All four beats present and clearly labelled
  - Action explains the reasoning, not just the steps ("I suspected X because Y")
  - Result contains a number
  - Includes an honest "what I would do differently"
  - Uses past simple consistently (the most common tense error in this kind of story)
---
Tell one real incident using STAR, in English.

Good candidates from your own history:

- the trading bot that kept a **phantom position** because a sale happened outside the system;
- `Number(null) === 0` turning "balance not read" into "balance is zero, confirmed";
- the delivery metric that was **3.4× wrong** because it counted only one type of inbound movement;
- the Telegram bot returning 409 because a second instance was polling with the same token;
- the build that failed with a PKIX error because the antivirus was re-signing TLS certificates.

**Watch the tense.** This is a story about the past, so it is past simple throughout: *"I noticed", "it
turned out", "we changed"* — not *"I have noticed"*. Present perfect is for things still relevant now
with no specific time ("I've been working here for three years").
---
A worked example, labelled. Yours should be your own incident.

> **(S)** Last year I was running a small trading bot on a phone — Termux, PM2, a SQLite database. It
> managed a fixed number of slots, and each slot could hold one open position.
>
> **(T)** Slots were getting stuck: the bot thought a position was open when it wasn't, so it stopped
> buying. My job was to find out why, because from the outside it just looked like the bot had "stopped
> working".
>
> **(A)** I started from the state rather than the code, because the logs looked normal — that was the
> first clue. I compared the local database with the exchange's actual positions and found a slot marked
> as open with nothing behind it. Then I traced back and found two causes. First, a sale made **manually,
> outside the bot**, left the local state stale: the bot had no way of knowing. Second, when the balance
> read failed, the code did `Number(null)`, which is zero in JavaScript, so "I couldn't read the balance"
> silently became "the balance is zero, confirmed". I fixed both: the bot now reconciles against the
> exchange on startup and periodically, and the balance check rejects null explicitly instead of
> coercing it.
>
> **(R)** Stuck slots went to zero, and I watched it for two weeks before calling it fixed. What I'd do
> differently: I'd add the reconciliation check **first**, before writing any of the trading logic. The
> rule I took from it is that the local state is never the source of truth when there's an external
> system — and I've applied that in two projects since.

**Why this scores well:** the Action explains *reasoning* ("I started from the state because the logs
looked normal"), there are two distinct root causes rather than one convenient one, the Result has a
number and a **verification period**, and the closing lesson is transferable — which is exactly what an
interviewer is listening for.
:::

## Explaining systems out loud

### Signposting: the phrases that buy you time

When you explain an architecture in a second language, the hard part is not vocabulary — it is holding
the structure while translating. **Signposting phrases** solve both: they tell the listener where you
are and give you a beat to think.

| Purpose | Phrases |
| --- | --- |
| Announcing structure | *"I'll cover three things: X, Y and Z."* · *"Let me start with the data flow."* |
| Moving on | *"That covers the write path. Now the read path."* · *"Moving on to..."* |
| Flagging a trade-off | *"The trade-off here is..."* · *"What I'm giving up is..."* |
| Stating an assumption | *"I'm assuming X — is that fair?"* · *"Let's say the peak is three times the average."* |
| Checking in | *"Does that make sense so far?"* · *"Would you like me to go deeper here or move on?"* |
| Recovering | *"Sorry, let me rephrase that."* · *"What I mean is..."* |

:::nota The word you don't know
You will hit a missing word. The professional move is to **describe it and keep going**: *"the thing that
decides which server gets the request — the load balancer, right"*. Stopping to search for a word costs
you more credibility than describing it. Native speakers do this constantly; it reads as fluency, not as
a gap.
:::

### Numbers, units and the small things that sound wrong

Small habits that instantly mark a translated sentence:

- **Decimals**: English uses a point — "three point four times", not "three comma four".
- **Thousands**: "two hundred thousand requests", not "two hundreds of thousands".
- **Percentages**: "it dropped by 40 %" (by, for change) vs "it dropped to 40 %" (to, for final value).
  Mixing these two changes the meaning completely.
- **"Actually"** does not mean *atualmente*. It means *na verdade*. Use "currently" for *atualmente*.
- **"Eventually"** does not mean *eventualmente* (occasionally). It means *no fim das contas*.
- **"Realise"** means *perceber*, not *realizar*. To *realizar* a task is to "carry it out" or "do" it.
- **Latency is high or low**, not "big"/"small". **Load is heavy**. A system **goes down**, it doesn't "fall".

:::alerta O falso amigo que mais custa caro
*"Eventually consistent"* não significa "eventualmente consistente" no sentido de "às vezes consistente".
Significa **"consistente no fim"** — o sistema converge. Traduzir errado esse par muda a garantia que
você está prometendo numa entrevista de system design.
:::

:::atividade
id: explain-your-system-en
titulo: Explain one of your systems in English
termos: [the-trade-off-here-is, to-scale-horizontally, i-would-start-by]
nivel: 4
tempoMin: 35
ambiente: papel
entrega:
  tipo: texto
  rotulo: Your explanation, in English, with signposting phrases
  minimoChars: 600
dicas:
  - Follow the data, not the boxes: "a request comes in, then..., then...".
  - Use at least three signposting phrases from the table above.
  - State one trade-off explicitly, including the NEW problem your choice created.
criterios:
  - Follows the data path rather than listing components
  - Uses at least three signposting phrases naturally
  - States one trade-off explicitly, with the new problem it created
  - Includes at least one number (scale, latency, volume)
  - Consistent tense and clear short sentences
---
Explain **one of your own systems** in English, as if the interviewer just asked *"Walk me through
something you built."*

Pick one: the study app with spaced repetition; the trading bot with slots and a Telegram bot; the
retail dashboard with materialised views; the WhatsApp automation over ADB.

Structure your answer:

1. one sentence on **what it does and for whom**;
2. the **write path**: what happens when data comes in;
3. the **read path**: what happens when someone looks at it;
4. one **trade-off** you made on purpose — and the new problem it created;
5. what you would change if the load grew 10×.

Aim for something you could say in about three minutes.
---
A worked example — again, yours should be your own system.

> It's a study app I use on my phone every day. It stores everything in files rather than a database,
> and it tracks what I've learned using spaced repetition.
>
> **Let me start with the write path.** When I answer a card, the browser sends the score to a small
> Express server. The server runs an SM-2 calculation to decide when I should see that term again, and
> writes the whole progress object to a JSON file. The write is atomic — it writes to a temporary file
> and renames it — because a crash halfway through used to leave the file unreadable, and then the app
> couldn't even start.
>
> **Now the read path.** Content lives in plain JSON and Markdown files on disk. The server reloads a
> folder only when a file's modification time changes, so adding a new deck needs no restart and no
> build. There are around 550 terms and a hundred exercises, and the whole thing fits comfortably in
> memory.
>
> **The trade-off I made on purpose** was using files instead of a database. I get zero setup, easy
> backups and content I can edit in any text editor — which matters, because this runs on an Android
> phone under PRoot where installing things is painful. **What I gave up** is concurrent writes and
> queries. **And the new problem that created** is that two processes writing at the same time would
> corrupt the state, so there is exactly one writer, and the shutdown handler waits for the write queue
> to drain before the process exits.
>
> **If the load grew ten times** — say, if other people started using it — files would stop working,
> mostly because of concurrent writes rather than volume. I'd move progress into SQLite first, since it
> keeps the single-file simplicity but gives me transactions, and only move to Postgres if I actually
> needed multiple writers.

**Why this works:** it follows the data instead of listing components; the signposting ("Let me start
with", "Now the read path", "The trade-off I made") keeps the listener oriented and gives the speaker
thinking time; the trade-off is stated with **all three parts** — what was gained, what was given up,
and the new problem; and the final answer is specific about *what* would break first, which is the part
most candidates skip.
:::

### Questions you ask them

The last five minutes are still part of the interview. Weak questions ("What's the culture like?") get
weak answers. Strong questions are specific and reveal that you've operated systems:

- *"What does on-call look like for this team — how many pages in a typical week?"*
- *"How long does it take from a merged pull request to production?"*
- *"What's the most painful part of the codebase right now?"*
- *"When something breaks in production, who writes the postmortem, and what happens to it?"*

These are also **your** filter: the answers tell you whether the team measures things or improvises.
