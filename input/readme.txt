FireFly WaveEditor

- start WaveEditor.exe
- click "load" button and select Wave.DAT
- now you can move with the mouse the yellow circles in the wave view to change the wave
- click "compile" and left the listbox would be actualized
- double click on any entry in this listbox and the program plays this wave, you see the lightning in the black box
- click "save" button to save you wave data
- click "export" button to create a header file of your wave
- with right mouse click and holding down into wave view you can move this view to left and right
- a single wave starts and stops with a 0 sample
- combined waves are concatenations of single waves not longer as 3 seconds

ATTENTION:
- you should try to get a power of 2 of different waves, iff you get more or less of 32 such waves then you must change
  in FireFly.c follow line:
    uint16_t* data = (uint16_t*)&wave_data[lfsr(5)];
  as example: iff you make 64 waves then change lfsr(5) to lfsr(6), eg 2^5=32 and 2^6=64
- iff you want as example 48 waves then use:
    lfsr(5) + lfsr(4) == 2^5 + 2^4 = 32 + 16 == 48

- currently the project has space of about 2k to use for waves

best regards, Hagen
