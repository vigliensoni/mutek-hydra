
window.onload = function () {
  const hydra = new Hydra()



    a.show();
    a.setBins(4);
    a.setSmooth(.96)
    a.hide()


  const video = document.createElement("video")
  video.autoplay = true
  video.crossOrigin = "anonymous"
  video.muted = true
  video.loop = true
  video.src = "./fotos/videos/microscopio_03_liteslow.mp4"

  video.play().then(()=>s0.init({src:video, dynamic:true}))




  osc(3,()=> a.fft[4]*.03 )
  .rotate(1.4,.2)
  .add(osc(3,.2))
  .out(o0)




  osc(0.50   ,1.25).mult(shape(12,20.09).rotate(()=>Math.random()*15))
    .diff(osc(()=>a.fft[0]*.1+03))
    .add(shape(3,22).rotate(()=>Math.random()*15).blend(gradient(1.6)))
    .modulate(noise(6)
              .modulate(noise(2).scrollY(()=> a.fft[2]*5,0.0625)))
              // .modulate(osc(3).rotate(()=>4+3*Math.sin(time*.000020)))
    .blend(o0)
    .color(17,-90.5,0.75)
    .out(o1)





  src(s0)
    // .modulate(o3)
    .scale(() =>  mouse.x * 0.0005+ .2)
    .rotate(()=>a.fft[3]*.01*Math.sin(time*.2)+.003)
    .modulate(o1)
    .rotate(()=> a.fft[0]*-.3+-.3 )

    .kaleid(()=>mouse.y*.001+1)
    .scrollX(({time})=>4+3*Math.sin(time*.002))
    .saturate(0.2)
    .contrast(2)
    .modulateRotate(noise(.2, ()=> a.fft[3]*-.02 ))
   .modulate(o2,.002)
   .blend(o3)

.out(o2)




gradient(.2,.03,2)
.saturate(()=>a.fft[1]*3+0.2)
.mask(o1)

.out(o3)


render(o2)






}
