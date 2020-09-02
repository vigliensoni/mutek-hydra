// AGREGANDO FOTO



window.onload = function () {
  const hydra = new Hydra()


a.show();
a.setBins(4);
a.setSmooth()
// a.hide()


  const video = document.createElement("video")
  video.autoplay = true
  video.crossOrigin = "anonymous"
  video.muted = true
  video.loop = true
  video.src = "./fotos/videos/microscopio_03_liteslow.mp4"

  video.play().then(()=>s0.init({src:video, dynamic:true}))

  // const video2 = document.createElement("video")
  // video2.autoplay = true
  // video2.crossOrigin = "anonymous"
  // video2.muted = true
  // video.loop = true
  // video.src = "./fotos/videos/explosiones_slow.mp4.mov"
  // video.play().then(()=>s1.init({src:video2, dynamic:true}))
  //
  //


  a.show();
  a.setBins(4);
  a.setSmooth(.96)
  // a.hide()


  // osc(23,.004,.3)
  // .scrollX(.2)
  // .rotate(.25,.2)
  // .modulateRotate(o0,() => 0.1 + mouse.x * 0.0002)
  // .modulateScale(o1)
  // .blend(o0)
  // .out(o0)

  osc(13,()=> a.fft[4]*.03 )

  .rotate(1.4,.2)
  .add(osc(3,.2))
  .out(o0)



  // osc(8,()=> a.fft[0]*.00003)
  //   .rotate(1.4,.2)
  //
  // .color(.9,0,5)
  // .modulate(osc(10).rotate(1, 0.5))
  // .rotate(1, 0.2)
  // //   .add(osc(3,.2))
  // .modulate(o0)
  // .out(o1)





  shape(3,0.125,.02)

  .rotate(()=> a.fft[4]*3+2 )
  .scrollX([-0.5,-0.2,0.3,-0.1,-0.1].smooth(0.1).fast(0.3))
  .scrollY([0.25,-0.2,0.3,-0.1,0.2].smooth(0.9).fast(0.15))
  .modulateRepeat(osc(60,-0.015,0.13)
                  .rotate(Math.PI/2))
  . modulateScale(osc(()=> a.fft[2]*7),.4)

  // .modulateRepeat(o0)
  .out(o1)



  src(s0)
    .scale(.7)
    .scale(() => .7 + mouse.x * 0.0002)
    .modulate(o1)
    .kaleid(()=>mouse.y*.002+1)
    .scrollX(({time})=>4+3*Math.sin(time*.002))
    .saturate(0.2)
    .contrast(2)
   .modulateRotate(o0,.4, .2)
   .modulate(o3)

   .blend(o3)

.out(o2)




gradient(.2,.3,.2)
.saturate(()=>a.fft[1]*7)
.mask(o1)

.out(o3)





  render(o2)








}
