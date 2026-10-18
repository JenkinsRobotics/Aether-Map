package com.aether.map.receiver;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.*;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.qrcode.QRCodeWriter;
import org.webrtc.*;
import org.webrtc.audio.JavaAudioDeviceModule;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.UUID;

/** D-pad usable foreground receiver. Leaving the app releases decoding, audio and signalling. */
public final class ReceiverActivity extends Activity {
    private SharedPreferences preferences;
    private final Object identityLock=new Object();
    private SurfaceViewRenderer renderer;
    private PeerConnectionFactory factory;
    private EglBase egl;
    private ReceiverSession session;
    private LinearLayout panel;
    private TextView status,code,server;
    private ImageView qr;
    private Button audioButton,receiveButton;
    private boolean resumed,video,paused,audible;
    private String qrLink="";
    private AudioManager audioManager;
    private AudioFocusRequest audioFocus;
    private boolean hasFocus;
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        preferences=getSharedPreferences("receiver",MODE_PRIVATE);audible=preferences.getBoolean("audio",false);
        audioManager=(AudioManager)getSystemService(AUDIO_SERVICE);
        audioFocus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MOVIE).build())
                .setOnAudioFocusChangeListener(change -> {
                    hasFocus=change==AudioManager.AUDIOFOCUS_GAIN;
                    if(session!=null)session.audio(audible&&hasFocus);
                }).build();
        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(this).createInitializationOptions());
        egl=EglBase.create();
        var audioModule=JavaAudioDeviceModule.builder(this).setUseHardwareAcousticEchoCanceler(false).setUseHardwareNoiseSuppressor(false).createAudioDeviceModule();
        factory=PeerConnectionFactory.builder().setAudioDeviceModule(audioModule)
                .setVideoDecoderFactory(new DefaultVideoDecoderFactory(egl.getEglBaseContext()))
                .setVideoEncoderFactory(new DefaultVideoEncoderFactory(egl.getEglBaseContext(),true,true)).createPeerConnectionFactory();
        audioModule.release();
        FrameLayout root=new FrameLayout(this);root.setBackgroundColor(Color.BLACK);setContentView(root);
        renderer=new SurfaceViewRenderer(this);renderer.init(egl.getEglBaseContext(),null);
        renderer.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FIT);renderer.setEnableHardwareScaler(true);
        root.addView(renderer,new FrameLayout.LayoutParams(-1,-1));
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(false);
        FrameLayout.LayoutParams overlay=new FrameLayout.LayoutParams(dp(650),-2,Gravity.CENTER);
        root.addView(scroll,overlay);
        panel=new LinearLayout(this);panel.setOrientation(LinearLayout.VERTICAL);panel.setPadding(dp(28),dp(20),dp(28),dp(20));panel.setGravity(Gravity.CENTER);panel.setBackgroundColor(0xf215151f);scroll.addView(panel);
        TextView title=text("Aether Map Receiver",26);title.setTypeface(null,Typeface.BOLD);panel.addView(title);
        server=text("",14);panel.addView(server);
        status=text("Connect this TV to your Aether Studio server",18);panel.addView(status);
        code=text("",36);code.setTypeface(Typeface.MONOSPACE,Typeface.BOLD);panel.addView(code);
        qr=new ImageView(this);qr.setContentDescription("Pairing QR code");panel.addView(qr,new LinearLayout.LayoutParams(dp(200),dp(200)));qr.setVisibility(View.GONE);
        LinearLayout actions=new LinearLayout(this);actions.setGravity(Gravity.CENTER);panel.addView(actions);
        receiveButton=button("Pause receiver",() -> {paused=!paused;if(paused){stopReceiver();show("Receiver paused","",false);}else startReceiver();receiveButton.setText(paused?"Start receiver":"Pause receiver");});actions.addView(receiveButton);
        audioButton=button("",() -> {audible=!audible;preferences.edit().putBoolean("audio",audible).apply();applyAudio();});actions.addView(audioButton);
        actions.addView(button("Settings",this::settings));
        LinearLayout secondary=new LinearLayout(this);secondary.setGravity(Gravity.CENTER);panel.addView(secondary);
        secondary.addView(button("Licenses",this::licenses));secondary.addView(button("Exit",this::finish));
        panel.addView(text("Use the remote’s center button to show or hide these controls during playback. Back returns to controls before leaving.",13));
        applyAudio();
        if(preferences.getString("origin","").isEmpty())settings();
    }
    private void licenses(){
        StringBuilder notices=new StringBuilder();
        for(String file:new String[]{"WEBRTC-SDK-MIT.txt","WEBRTC.md","ZXING-APACHE.txt"})try(java.io.InputStream in=getAssets().open("licenses/"+file)){
            java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] bytes=new byte[8192];int count;
            while((count=in.read(bytes))!=-1)out.write(bytes,0,count);
            notices.append(file).append("\n\n").append(out.toString("UTF-8")).append("\n\n");
        }catch(java.io.IOException missing){notices.append("License file unavailable: ").append(file);}
        TextView content=text(notices.toString(),12);content.setGravity(Gravity.START);ScrollView scroll=new ScrollView(this);scroll.addView(content);
        new AlertDialog.Builder(this).setTitle("Open-source licenses").setView(scroll).setPositiveButton("Close",null).show();
    }
    private static HashMap<EncodeHintType,Object> qrHints(){
        HashMap<EncodeHintType,Object> hints=new HashMap<>();hints.put(EncodeHintType.MARGIN,4);hints.put(EncodeHintType.ERROR_CORRECTION,com.google.zxing.qrcode.decoder.ErrorCorrectionLevel.M);return hints;
    }
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private TextView text(String value,int size){TextView v=new TextView(this);v.setText(value);v.setTextSize(size);v.setTextColor(Color.WHITE);v.setGravity(Gravity.CENTER);v.setPadding(dp(6),dp(6),dp(6),dp(6));return v;}
    private Button button(String value,Runnable action){Button b=new Button(this);b.setText(value);b.setTextSize(15);b.setMinHeight(dp(52));b.setOnClickListener(v->action.run());return b;}
    private void applyAudio(){
        if(audible && video && resumed)hasFocus=audioManager.requestAudioFocus(audioFocus)==AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        else {audioManager.abandonAudioFocusRequest(audioFocus);hasFocus=false;}
        if(session!=null)session.audio(audible&&hasFocus);
        if(audioButton!=null)audioButton.setText(audible?"Sound on":"Sound off");
    }
    private void settings(){
        stopReceiver();
        LinearLayout fields=new LinearLayout(this);fields.setOrientation(LinearLayout.VERTICAL);fields.setPadding(dp(24),dp(12),dp(24),dp(12));
        TextView help=text("Enter the HTTPS network address shown by Studio. The TV and this computer must be able to reach each other. A private certificate must be trusted on this TV.",16);fields.addView(help);
        EditText origin=new EditText(this);origin.setSingleLine();origin.setHint("https://studio.example:8780");origin.setContentDescription("Studio server address");origin.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_URI);origin.setText(preferences.getString("origin",""));fields.addView(origin);
        EditText name=new EditText(this);name.setSingleLine();name.setHint("Living room TV");name.setContentDescription("Receiver name");name.setText(preferences.getString("name","Aether TV"));fields.addView(name);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Receiver settings").setView(fields).setNegativeButton("Cancel",(d,w)->startReceiver()).setPositiveButton("Connect",null).create();
        dialog.setOnCancelListener(d->startReceiver());
        dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
            try {
                String address=ServerOrigin.parse(origin.getText().toString()), label=name.getText().toString().trim();
                if(label.isEmpty() || label.codePointCount(0,label.length())>80 || label.codePoints().anyMatch(Character::isISOControl))throw new IllegalArgumentException("Enter a receiver name of 1–80 characters.");
                SharedPreferences.Editor edit=preferences.edit().putString("origin",address).putString("name",label);
                if(!address.equals(preferences.getString("origin","")) || preferences.getString("id","").isEmpty()){
                    byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);StringBuilder proof=new StringBuilder();for(byte b:bytes)proof.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
                    edit.putString("id",UUID.randomUUID().toString()).putString("proof",proof.toString()).remove("token");
                }
                synchronized(identityLock){if(!edit.commit())throw new IllegalArgumentException("Could not save receiver settings. Check device storage.");}
                paused=false;receiveButton.setText("Pause receiver");dialog.dismiss();startReceiver();
            }catch(IllegalArgumentException invalid){origin.setError(invalid.getMessage());}
        }));dialog.show();
    }
    private void startReceiver(){
        if(!resumed || paused || session!=null)return;
        String origin=preferences.getString("origin","");if(origin.isEmpty())return;
        SignalClient client=new SignalClient(origin,preferences.getString("id",""),preferences.getString("proof",""),preferences.getString("name","Aether TV"));
        ReceiverSession[] current=new ReceiverSession[1];
        String identity=preferences.getString("id","");
        current[0]=new ReceiverSession(client,new ScopedCredentials(identityLock,new ScopedCredentials.Store(){
            public String origin(){return preferences.getString("origin","");}
            public String id(){return preferences.getString("id","");}
            public String token(){return preferences.getString("token","");}
            public void saveToken(String token){if(!preferences.edit().putString("token",token).commit())throw new IllegalStateException("Could not save receiver credential");}
        },origin,identity),events->new NativeReceiver(factory,renderer,events),(message,pairing,playing)->runOnUiThread(()->{
            if(session==current[0])show(message,pairing,playing);
        }),audible&&hasFocus);
        session=current[0];server.setText(origin);show("Connecting to Studio…","",false);session.start();
    }
    private void stopReceiver(){
        ReceiverSession old=session;session=null;if(old!=null)old.stop();video=false;applyAudio();if(renderer!=null)renderer.clearImage();
    }
    private void show(String message,String pairing,boolean playing){
        boolean entering=playing&&!video;video=playing;status.setText(message);code.setText(pairing);code.setVisibility(pairing.isEmpty()?View.GONE:View.VISIBLE);
        String link=pairing.isEmpty()?"":ServerOrigin.pairingLink(preferences.getString("origin",""),pairing);
        if(!link.equals(qrLink)){
            qrLink=link;qr.setVisibility(link.isEmpty()?View.GONE:View.VISIBLE);
            if(!link.isEmpty())try{
                var matrix=new QRCodeWriter().encode(link,BarcodeFormat.QR_CODE,480,480,qrHints());
                int[] pixels=new int[480*480];for(int y=0;y<480;y++)for(int x=0;x<480;x++)pixels[y*480+x]=matrix.get(x,y)?Color.BLACK:Color.WHITE;
                qr.setImageBitmap(Bitmap.createBitmap(pixels,480,480,Bitmap.Config.ARGB_8888));
            }catch(Exception invalid){qr.setVisibility(View.GONE);}
            else qr.setImageDrawable(null);
        }
        if(!playing)panel.setVisibility(View.VISIBLE);else if(entering)panel.setVisibility(View.GONE);
        if(entering || !playing)applyAudio();
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event){
        if(video && panel.getVisibility()!=View.VISIBLE && event.getAction()==KeyEvent.ACTION_DOWN &&
            (event.getKeyCode()==KeyEvent.KEYCODE_DPAD_CENTER || event.getKeyCode()==KeyEvent.KEYCODE_ENTER || event.getKeyCode()==KeyEvent.KEYCODE_BACK)){
            panel.setVisibility(View.VISIBLE);receiveButton.requestFocus();return true;
        }
        if(video && panel.getVisibility()==View.VISIBLE && event.getKeyCode()==KeyEvent.KEYCODE_BACK){if(event.getAction()==KeyEvent.ACTION_DOWN)panel.setVisibility(View.GONE);return true;}
        return super.dispatchKeyEvent(event);
    }
    @Override protected void onResume(){super.onResume();resumed=true;startReceiver();}
    @Override protected void onPause(){resumed=false;stopReceiver();super.onPause();}
    @Override protected void onDestroy(){stopReceiver();renderer.release();factory.dispose();egl.release();super.onDestroy();}
}
