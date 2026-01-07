
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { extractAddressFromImage, searchAddresses, AddressCandidate } from './services/geminiService';
import { DeliveryLocation, UserLocation } from './types';
import { 
  CameraIcon, 
  MapIcon, 
  TrashIcon, 
  CheckCircleIcon, 
  ArrowPathIcon, 
  PlusIcon, 
  MapPinIcon, 
  HomeIcon, 
  SparklesIcon,
  ArrowTopRightOnSquareIcon,
  SignalIcon
} from '@heroicons/react/24/outline';

const App: React.FC = () => {
  const [stops, setStops] = useState<DeliveryLocation[]>([]);
  const [currentLocation, setCurrentLocation] = useState<UserLocation | null>(null);
  const [originLocation, setOriginLocation] = useState<{address: string, lat: number, lng: number} | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Processando...');
  const [manualInput, setManualInput] = useState('');
  const [showManual, setShowManual] = useState(false);
  
  const [candidates, setCandidates] = useState<AddressCandidate[]>([]);
  const [showCandidateSelection, setShowCandidateSelection] = useState(false);
  const [selectionTarget, setSelectionTarget] = useState<'stop' | 'origin'>('stop');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Carregamento inicial de dados salvos
    const savedStops = localStorage.getItem('rota_stops_v13');
    if (savedStops) setStops(JSON.parse(savedStops));

    const savedOrigin = localStorage.getItem('rota_origin_v13');
    if (savedOrigin) setOriginLocation(JSON.parse(savedOrigin));

    // Iniciar GPS
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => console.error("Erro GPS:", err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    localStorage.setItem('rota_stops_v13', JSON.stringify(stops));
  }, [stops]);

  useEffect(() => {
    if (originLocation) localStorage.setItem('rota_origin_v13', JSON.stringify(originLocation));
    else localStorage.removeItem('rota_origin_v13');
  }, [originLocation]);

  const calculateDistance = (l1: {lat: number, lng: number}, l2: { lat: number, lng: number }) => {
    const R = 6371;
    const dLat = (l2.lat - l1.lat) * (Math.PI / 180);
    const dLon = (l2.lng - l1.lng) * (Math.PI / 180);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(l1.lat * (Math.PI / 180)) * Math.cos(l2.lat * (Math.PI / 180)) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const sortStops = useCallback(() => {
    const origin = originLocation || currentLocation;
    if (!origin) return alert("Sinal de GPS ainda não disponível.");
    
    setStops(prev => {
      const sorted = [...prev].sort((a, b) => calculateDistance(origin, a) - calculateDistance(origin, b));
      return sorted.map((s, idx) => ({ ...s, order: idx + 1 }));
    });
  }, [originLocation, currentLocation]);

  const addStopDirectly = (c: AddressCandidate) => {
    setStops(prev => [...prev, { 
      id: Date.now().toString(), 
      address: c.address, 
      lat: c.lat, 
      lng: c.lng, 
      status: 'pending', 
      order: prev.length + 1 
    }]);
  };

  const handlePhotoCapture = async () => {
    if (!canvasRef.current || !videoRef.current) return;
    const context = canvasRef.current.getContext('2d');
    if (context) {
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);
      const base64 = canvasRef.current.toDataURL('image/jpeg', 0.8).split(',')[1];
      stopCamera();
      setIsLoading(true);
      setLoadingMessage('Processando Imagem...');
      
      try {
        const rawAddress = await extractAddressFromImage(base64);
        if (rawAddress) {
          const results = await searchAddresses(rawAddress, currentLocation || undefined);
          if (results.length === 1) {
            if (selectionTarget === 'origin') setOriginLocation(results[0]);
            else addStopDirectly(results[0]);
          } else if (results.length > 1) {
            setCandidates(results);
            setShowCandidateSelection(true);
          } else {
            setManualInput(rawAddress);
            setShowManual(true);
          }
        } else {
          alert("Não conseguimos ler a etiqueta. Tente digitar o endereço.");
          setShowManual(true);
        }
      } catch (err) {
        alert("Erro de conexão com o servidor. Verifique sua internet.");
        setShowManual(true);
      }
      setIsLoading(false);
    }
  };

  const startCamera = (target: 'stop' | 'origin') => {
    setSelectionTarget(target);
    setIsCapturing(true);
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => { if (videoRef.current) videoRef.current.srcObject = stream; })
      .catch(() => { alert("Câmera bloqueada ou indisponível."); setIsCapturing(false); });
  };

  const stopCamera = () => {
    videoRef.current?.srcObject && (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    setIsCapturing(false);
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-[#0b1120] text-slate-200 font-sans">
      <header className="p-6">
        <div className="bg-indigo-600 p-6 rounded-[2rem] shadow-xl relative overflow-hidden">
          <div className="flex justify-between items-start mb-6">
            <h1 className="text-xl font-black flex items-center gap-2 italic">
              <MapIcon className="w-6 h-6"/> ROTA EXPRESS
            </h1>
            <div className="flex gap-2">
              <button onClick={() => { if(confirm("Limpar tudo?")) setStops([]); }} className="p-2 bg-red-500 rounded-full shadow-lg"><TrashIcon className="w-5 h-5"/></button>
              <button onClick={sortStops} className="p-2 bg-white rounded-full shadow-lg text-indigo-600"><ArrowPathIcon className="w-5 h-5"/></button>
            </div>
          </div>
          
          <div 
            onClick={() => { setSelectionTarget('origin'); setShowManual(true); }} 
            className={`p-4 rounded-2xl flex items-center gap-3 border ${originLocation ? 'bg-white/10 border-white/20' : 'bg-indigo-500/30 border-indigo-400/50'}`}
          >
            {originLocation ? <HomeIcon className="w-5 h-5 text-indigo-200" /> : <SignalIcon className="w-5 h-5 text-green-400 animate-pulse" />}
            <div className="flex-1 truncate">
              <p className="text-[8px] font-black uppercase opacity-60">Ponto de Partida</p>
              <p className="text-xs font-bold truncate">{originLocation?.address || "Minha Localização (GPS)"}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 space-y-3 overflow-y-auto pb-32">
        {stops.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center opacity-20 text-center">
            <SparklesIcon className="w-12 h-12 mb-2" />
            <p className="font-bold text-xs uppercase tracking-widest">Nenhuma entrega adicionada</p>
          </div>
        ) : (
          stops.map((stop) => (
            <div key={stop.id} className={`p-4 rounded-2xl border ${stop.status === 'completed' ? 'bg-slate-900 border-slate-800 opacity-40' : 'bg-slate-800 border-slate-700'}`}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-xs">{stop.order}</div>
                <div className="flex-1 truncate text-xs font-bold">{stop.address}</div>
                <button onClick={() => setStops(prev => prev.map(s => s.id === stop.id ? { ...s, status: s.status === 'pending' ? 'completed' : 'pending' } : s))} className={stop.status === 'completed' ? 'text-green-500' : 'text-slate-500'}>
                  <CheckCircleIcon className="w-6 h-6" />
                </button>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => window.open(`https://www.waze.com/ul?ll=${stop.lat},${stop.lng}&navigate=yes`)} className="bg-indigo-500/10 text-indigo-400 text-[9px] font-black uppercase px-3 py-1 rounded-md border border-indigo-400/20">Waze</button>
                <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`)} className="bg-slate-700 text-slate-400 text-[9px] font-black uppercase px-3 py-1 rounded-md">Maps</button>
              </div>
            </div>
          ))
        )}
      </main>

      <div className="fixed bottom-0 inset-x-0 p-6 bg-gradient-to-t from-[#0b1120] to-transparent">
        <div className="flex gap-2 max-w-md mx-auto">
          <button onClick={() => { setSelectionTarget('stop'); setShowManual(true); }} className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center shadow-xl border border-slate-700">
            <PlusIcon className="w-6 h-6" />
          </button>
          <button onClick={() => startCamera('stop')} className="flex-1 bg-indigo-600 rounded-2xl flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest shadow-xl">
            <CameraIcon className="w-5 h-5" /> Escanear Etiqueta
          </button>
        </div>
      </div>

      {showManual && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end p-4">
          <div className="bg-slate-800 w-full rounded-[2rem] p-6 shadow-2xl animate-slide-up">
            <h3 className="font-black text-[10px] uppercase opacity-50 mb-4">{selectionTarget === 'origin' ? 'Definir Partida' : 'Novo Endereço'}</h3>
            <input autoFocus className="w-full p-4 bg-slate-900 rounded-xl border border-slate-700 mb-4 outline-none focus:border-indigo-500" value={manualInput} onChange={e => setManualInput(e.target.value)} placeholder="Rua, Número, Bairro..." />
            <div className="flex gap-2">
              <button onClick={() => {setShowManual(false); setManualInput('');}} className="flex-1 py-4 font-bold text-xs opacity-40">VOLTAR</button>
              <button onClick={async () => {
                if(!manualInput) return;
                setIsLoading(true);
                try {
                  const res = await searchAddresses(manualInput, currentLocation || undefined);
                  if(res.length > 0) {
                    if(selectionTarget === 'origin') setOriginLocation(res[0]);
                    else addStopDirectly(res[0]);
                    setShowManual(false);
                    setManualInput('');
                  } else alert("Endereço não localizado.");
                } catch(e) { alert("Falha na busca."); }
                setIsLoading(false);
              }} className="flex-1 bg-indigo-600 py-4 rounded-xl font-black text-xs">CONFIRMAR</button>
            </div>
            {selectionTarget === 'origin' && (
              <button onClick={() => {setOriginLocation(null); setShowManual(false);}} className="w-full mt-4 text-[9px] font-black text-green-400 uppercase">Usar Localização Atual do GPS</button>
            )}
          </div>
        </div>
      )}

      {isCapturing && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col">
          <video ref={videoRef} autoPlay playsInline className="flex-1 object-cover" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 border-2 border-indigo-500/50 rounded-3xl relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 shadow-[0_0_15px_#6366f1] animate-scan"></div>
            </div>
          </div>
          <div className="p-8 bg-black flex justify-between items-center">
            <button onClick={stopCamera} className="text-white/40 font-bold text-xs">FECHAR</button>
            <button onClick={handlePhotoCapture} className="w-16 h-16 bg-white rounded-full border-4 border-indigo-600 shadow-xl"></button>
            <div className="w-10"></div>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {isLoading && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">{loadingMessage}</p>
        </div>
      )}

      <style>{`
        @keyframes scan { 0% { top: 0; } 100% { top: 100%; } }
        @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .animate-scan { animation: scan 2s infinite linear; }
        .animate-slide-up { animation: slide-up 0.3s ease-out; }
      `}</style>
    </div>
  );
};

export default App;
