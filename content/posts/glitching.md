---
title: "Glitching"
date: 2026-10-06T21:08:58+01:00
draft: true
---

I have had an amazing piece of technology sitting in a drawer gathering dust since 2017. It's a matrix coolrunner Rev D.

The coolrunner is a modchip for an Xbox 360. I've recently been giving my old games consoles a bit of tender love and care, Fixing a YLOD on an old PS3 and then attempting to modchip my old Xbox 360 of yore.

The process has been quite fun and its gotten me thinking about glitching in general and how it is more relevant, or at least more accessible today than it was back in 2017.

So in this blog post I'm going to talk a little about what glitching is, and why with todays security landscape, it makes more sense than it ever did before to look at esoteric attack vectors that get at the heart of what computers are actually doing, moving energy around in a system. 

- Using the Xbox 360 as an example
- Xbox 360 was designed with security in mind from its advent
- The entry point for the system is 1BL which is physically burned into the silicon of the CPU
- It's job is to load from NAND and verify that the next bootloader stage, CB is signed with a valid microsoft RSA key
- CB in turn does some more system initialisation but like 1BL, will load the next stage, CD, from NANd and ensure it is signed with a valid microsoft RSA key

The actual writeup for the RGH quotes:

> tmbinc said it himself, software based approaches of running unsigned code on the 360 mostly don't work, it was designed to be secure from a software point of view.


So if the door to the castle is locked, and the guards, who are wise to equine ploys, are checking ID's at the door, how does one get in? You don't use a key, you inform the guard that his shoelaces are untied and hit him over the head with a club.

The point is that if the lock itself is secure (e.g RSA signature checking), and the procedures surrounding entry are sound, sometimes the weakest point becomes something that the system relies on. In our metaphor this is a person, but in the case of the xbox 360, it is the fact that computation relies on a stable flow of energy to behave in a predicatable way.

This is what glitching does. in the case of the Xbox 360, researchers found that by asserting a CPU_RESET signal, a signal usually used to completely reset the CPU, for a handful of nanoseconds, something much more interesting happens. Instead of resetting, computation continues in a partially reset state.

Namely if PowerPC instructions like `mr` (move register) were occuring at the point in time CPU_RESET was asserted, the destination register will have a 0 placed it instead of the contents of the source register.

This kind of instruction occurs and is intregral to processes executed during the signature verification logic in CB, so if a CPU_RESET can be timed correctly, the net result of signiture verification during boot can be influenced. Making the system trust code that was never signed by microsoft to run on their system.

- With the advent of cheap microcontrollers with properties that allow them to be as deterministic as FPGAs, this kind of attack has become more accessible than ever:

- Stack Smashing hacking Apple Airtags with rp2040 for less than 5 euros
- Joe Grand hacking crypto wallets and recovering millions of dollars 
- Pico Glitcher

- I love the pi pico as its a very versatile microcontroller
- During hacking the xbox 360 I wanted to see if I could do it entirely in linux using pico
- I was able to use the pico as a flashing tool for the NAND using PicoFlasher firmware
- I was also able to program the CPLD on the coolrunner using a pico and the dirtyJTAG project 
- I even saw a project on github where the RGH1.2 is perfomed with a pico itself

