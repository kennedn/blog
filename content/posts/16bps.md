---
title: "Why does sampling at 16 bits work?"
date: 2025-08-27T09:43:48+01:00
draft: true 
math: true
imgs: 
    - inmp441.JPG
    - esp32cam.JPG
---

I have recently been pondering a question, that for many years I have not had an answer to: what does my dog get up to when she is left to her own devices?

For about as long as that thought has been in my head, I’ve had a **dog monitoring project** in mind as the solution. To this end, I’ve had a few cheap ESP32-CAM AI Thinker modules gathering dust in my drawer — alongside a handful of INMP441 microphones that I never quite got around to using.  

Last weekend I decided that to finally get this project off the ground I would do the obvious thing and blatantly steal some innocent soul’s software from GitHub, drop it on the ESP32, wire in the mic, integrate it all with Frigate, and call it done. Weekend project over.  

Except… while browsing through GitHub looking for my latest victim, I stumbled into a small conundrum.

---

## The mystery of 16-bit sampling

Every project I looked at that instantiated the ESP32 I²S driver for the INMP441 had the same thing in common:  

```c
i2s_config_t {
   .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
   ...
}

Sixteen bits.

But the [INMP441 datasheet](https://invensense.tdk.com/wp-content/uploads/2015/02/INMP441.pdf) clearly says that a single microphone transmits **24-bit data in a 32-bit I²S word frame**.

So how could this possibly be working? Surely what actually got copied from the device into the drivers buffer would be a garbled mess?
---

## What the ESP32 I²S actually does

To answer this, I cracked open the **ESP32 Technical Reference Manual**, specifically §22.4.5 *Receiving Data*. The receive pipeline has three stages:

1. **Serial → parallel expansion**

   > “The received-data stream is expanded to a zero-padded parallel-data stream with 32 high-order bits and 32 low-order bits.”

   Each channel word (up to 32 bits) goes into a 32-bit slot, with zero padding. Left and right make a 64-bit staging register.

2. **FIFO packing**

   > “There are four modes of writing received data into FIFO. Each mode corresponds to a value of I2S\_RX\_FIFO\_MOD\[2:0].”

   For our purposes:

   * `I2S_RX_FIFO_MOD = 1` → 16-bit single channel
   * `I2S_RX_FIFO_MOD = 2` → 32-bit dual channel

   In mode 1, the hardware **truncates** the 32-bit word into 16 bits before it enters FIFO. Typically, this means it keeps the top 16 bits (`D23..D8`) and discards the bottom 8 bits (including the pad).

   In mode 2, the full 32-bit word is preserved in FIFO (i.e. the mic’s 24 bits plus 8 pad bits).

   Figure 22.4-6 in the TRM makes this crystal clear: in mode 1, FIFO packs **two 16-bit samples per 32-bit RAM word**.

3. **DMA transfer**

   > “At the third stage, CPU or DMA will read data from FIFO and write them into the internal memory directly.”

   The DMA doesn’t reinterpret anything — it just copies what FIFO gives it. In mode 1, that means 16-bit samples (two packed per word). In mode 2, it means full 32-bit samples.

---

## The numbers that matter

At this point you might think, *OK, so mode 1 is just wrong — we’re losing the bottom 8 bits of the mic’s data*.

But here’s the kicker: those bottom 8 bits are basically useless anyway.

The INMP441 datasheet says:

* **Signal-to-noise ratio:** 61 dBA (typical)
* **Dynamic range:** \~95 dB

A perfect 16-bit PCM system has \~96 dB of dynamic range. In other words, this microphone cannot actually deliver more than about 16 bits’ worth of *useful* information. The lower 8 bits of its 24-bit output are essentially noise.

So the community default — `bits_per_sample = 16` — isn’t an accident. It works because there is nothing meaningful in the bits you’re discarding.

---

## Why you *could* still use 32 bits

For completeness: you can capture the full 32-bit word in FIFO mode 2, then right-shift in software to strip off the pad byte:

```c
int32_t raw = dma_buf[i];   // e.g. 0x12345600
int32_t val = raw >> 8;     // → 0x123456
```

This gives you all 24 valid bits, promoted to 32-bit signed integers. If you really care about squeezing every bit of resolution out of the microphone, this is the way to do it.

But for most applications — especially *“what’s my dog doing in the living room”* — it makes zero difference.

---

## Conclusion

What looked like a widespread mistake turned out to be a perfectly reasonable engineering tradeoff.

* The INMP441 outputs 24-bit samples in 32-bit frames.
* The ESP32 I²S hardware can capture either 16 or 32 bits per word.
* In 16-bit mode, the least significant 8 bits are dropped before the DMA sees them.
* But those 8 bits don’t carry useful information anyway, thanks to the microphone’s noise floor.

So, *why does sampling at 16 bits work?*
Because in this case, **that’s all the fidelity the mic ever really had to begin with.**

---

```

Would you like me to expand this with a **diagram of the DMA buffer layout** for mode 1 vs mode 2 (like how Fig. 22.4-6 shows it), so the reader can visually see why the ordering feels swapped when you read samples out of memory?
```

