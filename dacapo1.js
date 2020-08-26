
window.onload = function () {
  const hydra = new Hydra()


a.show();
a.setBins(4);
a.setSmooth(.96)
// a.hide()


s0.initCam(s0)


  const video = document.createElement("video")
  video.autoplay = true
  video.crossOrigin = "anonymous"
  video.muted = true
  video.loop = true
  video.src = "./fotos/videos/robotstrim.mp4"

  // video.play().then(()=>s1.init({src:video, dynamic:true}))

  // video.src = "./fotos/videos/robotstrim.mp4"

  // video.play().then(()=>s2.init({src:video, dynamic:true}))


  // // MEDIA READERS MEDIA READERS MEDIA READERS MEDIA READERS
  // const photo = new Image()
  // photo.onload = () => s3.init({src:photo, dynamic:true})
  // photo.crossOrigin = "anonymous"
  // // photo.src = "https://media.hitparade.ch/cover/big/zion_lennox_x_anuel_aa_x_haze-guayo_s.jpg"
  // photo.src = "./fotos/Interiores pintura/.jpg"


src(s0)

.mask(osc(20,3))


.saturate(0.3)
// .blend(o1,.5)
.scale(  () => a.fft[0]*3 )
.scrollY(.05, .0030)
.scrollX(0, ({time}) => Math.sin(time*0.5)*0.05 )

.blend(o0)
// .modulate(o3)

.modulateHue(o0)
.modulateScale(o0,.4)
// .blend(src(s2))

.modulate(o2,.001)
.out(o0)


//
// osc(10, 0.9, 300)
// .color(0.9, 0.7, 0.8)
// .diff(
//   osc(45, 0.3, 100)
//   .color(0.9, 0.9, 0.9)
//   .rotate(0.18)
//   .pixelate(12)
//   .kaleid()
// )
// .scrollX(10)
// .colorama()
// .luma()
// .repeatX(4)
// .repeatY(4)
// .modulate(
//   osc(1, -0.9, 300)
// )
// .scale(2)
// .out(o1)




// osc(3,.4)
// .rotate(6,.4)
// .kaleid(3)
// .out(o3)



src(s1)
  	.blend(src(o2).scale(1.1))
    .blend(o2)
.out(o2)
//
// gradient(0.125)
// .mask(osc(20,3),.4)
//
//   .pixelate([5,2,10],[15,8])
//   .scale(0.15)
//   .modulate(noise(1,0.25))
//   .scrollX(0, ({time}) => Math.sin(time*0.5)*0.05 )
//   .scrollY(0, ({time}) => Math.sin(time*0.01)*-0.07 )






// vid 1

  // src(s1)
  // // osc().modulate(osc(() => mouse.y * 1, 1.9, 0.08), 0.01, 0.1)
  // .scale(()=> a.fft[0]*.5 )
  // .out(o1)

// // vid 2
  // src(s2)
  // .out(o2)






}
