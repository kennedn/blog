---
title: "NESZero: NES Controller + Raspberry Pi Zero"
date: 2022-08-10T10:19:40+01:00
draft: true
imgs: 
    - full_wiring_carpet.JPG
---
<p align="center">
    <img src="case_closed_connected_front.JPG" width="300px"/>
    <img src="case_closed_connected_back.JPG" width="300px"/>
</p>

This project began more or less because I wanted to play EarthBound on a CRT TV. The TV itself only supports one connection type, a single scart port on the back of the unit. It became clear rather quickly that this kind of connectivity is a big limiting factor when it comes to approaching a problem like this.
I had a few options that I soon exhausted:

- ~~Playstation 2's Homebrew Scene~~ - Despite there being a few SNES emulators available, the performance was abysmal
- ~~HDMI to Composite adapter~~ - Only supports a subset of the PAL standards, displays incorrectly (in black and white) on my CRT TV.

So lets build something new.

# Build Requirements

- Full speed SNES games
- CRT TV Friendly

Settled on using a Raspberry Pi since they have RetroPie nicely packaged up, flocked to thingiverse for insperation and stumbled upon a NES controller project.
This seemed liked perfect fodder to fuel this project, and a few more requirements were drawn out of this decision:

- NES controller can be used as a functional controller
- Toggle the power of the console with a combination of NES Controller buttons
- Cram an RCA connection into the small form factor
- Add an Indicator LED to the system
- Learn how to 3d model so we can achieve the above two requirements


# Power toggling with a button combination

We want to be able to toggle the Rapsberry Pi Zero's power on / off with a button combination using the NES controllers buttons. To understand if this is even possible we first need to understand two things a little better:

- Raspberry Pi Zero power options
- NES Controller functionality

## Raspberry Pi Zero Power Options

Raspberry Pi has a powerful feature called overlays.

## NES Controller Functionality

NES Controller's are surprisingly simple. They consist of a single 4021 8-bit shift register. This little IC reads 8 seperate inputs and outputs them serially over a single pin. You can see from this diagram that each parallel input pin (`P1-8`) is wired to a button on the controller:

<p align="center">
    <img src="nes004-diagram.png" width="600px"/>
</p>

The other pins of note here are `CK` `P/S`, `DS` and `O8`.

|Name |Description|
|-----|-----------|
|`CK` |Clock pin  |
|`P/S`| Parallel or Serial select pin|
|`O8` | Serial Output|
|`DS` | Serial input, tied LOW|


When the Console want's to know the buttons that are being pressed on one of its controllers at a given time, it will do the following:

 - Set `P/S` LOW, we are now in Parallel in, serial out mode. On each clock pulse, the 4021 will store the state of the 8 connected buttons in parallel
 - Send 1 clock pulse on the `CK` pin. 
 - Set `P/S` HIGH, we are now in serial in, parallel out mode. On each clock pulse, the 4021 will read a new value in from `DS` and shift all registers to the right 
 - Loop 8 times:
    - Send 1 clock pulse on the `CK` pin. The next value becomes available on `O8` 
    - Read the value of `O8`

By stepping through this process, the Console can extract each button's state from the NES controller using only 3 pins.

Okay so how does that help us?