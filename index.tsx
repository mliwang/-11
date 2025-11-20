import React, { useState, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  AreaChart,
  Area,
} from "recharts";
import {
  Wind,
  Activity,
  Zap,
  Map as MapIcon,
  Download,
  Play,
  Pause,
  SkipForward,
  AlertTriangle,
  Cpu,
  TrendingUp,
  Layers,
  Fan,
  Network
} from "lucide-react";

// --- TYPES ---

type TurbineStatus = "normal" | "warning" | "critical" | "offline";

interface Turbine {
  id: string;
  farmId: 1 | 2;
  status: TurbineStatus;
  windSpeed: number;
  power: number;
  direction: number;
  temperature: number;
}

interface DataPoint {
  time: string;
  actualSpeed: number;
  predictedSpeed: number;
  baselineSpeed: number; // Current selected baseline value
  actualDir: number;
  predictedDir: number;
  activePatternId?: number; // Linkage for TSEG graph
}

type ModelType = "TSEG" | "LSTM" | "ARIMA" | "GRU" | "TCN";

// --- MOCK DATA ENGINE ---

const generateTimeSeriesData = (steps: number, spikeProbability: number = 0.1, model: ModelType): DataPoint[] => {
  const data: DataPoint[] = [];
  let currentSpeed = 8;
  let currentDir = 180;
  let time = new Date();
  time.setMinutes(time.getMinutes() - steps * 10);

  for (let i = 0; i < steps; i++) {
    const noise = (Math.random() - 0.5) * 1.5;
    let spike = 0;
    
    if (Math.random() < spikeProbability) {
      spike = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 5 + 2);
    }

    currentSpeed = Math.max(0, Math.min(25, currentSpeed + noise + spike));
    // Smooth direction change
    const dirChange = (Math.random() - 0.5) * 15;
    currentDir = (currentDir + dirChange + 360) % 360;

    // TSEG: High accuracy on spikes
    const tsegError = (Math.random() - 0.5) * 0.5; 
    const predictedSpeed = Math.max(0, currentSpeed + tsegError + (spike * 0.1)); // TSEG catches 90% of spike
    
    // Baseline Logic
    let baselineError = 0;
    switch (model) {
      case "LSTM":
        // Smooth but lags significantly
        baselineError = spike !== 0 ? -spike * 0.8 : (Math.random() - 0.5) * 1.5;
        break;
      case "GRU":
        // Similar to LSTM but slightly better on short term
        baselineError = spike !== 0 ? -spike * 0.7 : (Math.random() - 0.5) * 1.4;
        break;
      case "TCN":
        // Good at capturing local patterns but might ring/oscillate
        baselineError = spike !== 0 ? -spike * 0.4 : (Math.random() - 0.5) * 1.0;
        break;
      case "ARIMA":
        // Linear, misses spikes almost entirely
        baselineError = spike !== 0 ? -spike * 0.95 : (Math.random() - 0.5) * 2.0;
        break;
      default:
        baselineError = 0;
    }

    const baselineSpeed = Math.max(0, currentSpeed + baselineError);

    // Direction Prediction
    const predictedDir = (currentDir + (Math.random() - 0.5) * 5 + 360) % 360;

    // Determine which "TSEG Pattern Node" is active based on speed/trend
    let activePatternId = 0; // Stable
    if (spike > 2) activePatternId = 1; // Sudden Rise
    if (spike < -2) activePatternId = 2; // Sudden Drop
    if (currentSpeed > 15) activePatternId = 3; // High Wind
    if (Math.abs(dirChange) > 10) activePatternId = 4; // Direction Shift

    data.push({
      time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actualSpeed: parseFloat(currentSpeed.toFixed(2)),
      predictedSpeed: parseFloat(predictedSpeed.toFixed(2)),
      baselineSpeed: parseFloat(baselineSpeed.toFixed(2)),
      actualDir: parseFloat(currentDir.toFixed(1)),
      predictedDir: parseFloat(predictedDir.toFixed(1)),
      activePatternId
    });

    time.setMinutes(time.getMinutes() + 10);
  }
  return data;
};

// --- COMPONENTS ---

const Header = () => (
  <header className="h-16 border-b border-aero-border bg-white/80 backdrop-blur flex items-center justify-between px-6 sticky top-0 z-50 shadow-sm">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded flex items-center justify-center shadow-md">
        <Wind className="text-white w-5 h-5" />
      </div>
      <div>
        <h1 className="font-bold text-xl tracking-tighter text-slate-800">AeroSense <span className="text-slate-500 text-sm font-normal tracking-widest opacity-80 ml-2">风象预测系统</span></h1>
      </div>
    </div>
    <div className="flex items-center gap-6 text-sm font-mono text-slate-500">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse"></span>
        系统在线
      </div>
      <div>
        服务器: <span className="text-slate-700 font-semibold">CN-SOUTH-1</span>
      </div>
      <div className="px-3 py-1 rounded border border-aero-border bg-slate-100 text-slate-600 text-xs">
        v2.5.1-rc
      </div>
    </div>
  </header>
);

const StatCard = ({ label, value, unit, trend, icon: Icon, color }: any) => (
  <div className="glass-panel p-4 rounded-xl relative overflow-hidden group transition-all hover:shadow-lg">
    <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity ${color}`}>
      <Icon size={48} />
    </div>
    <div className="relative z-10">
      <p className="text-slate-500 text-xs font-mono uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <h3 className="text-2xl font-bold font-mono text-slate-800">{value}</h3>
        <span className="text-slate-400 text-sm">{unit}</span>
      </div>
      {trend && (
        <div className={`flex items-center gap-1 mt-2 text-xs ${trend > 0 ? 'text-neon-red' : 'text-neon-green'}`}>
          <TrendingUp size={12} className={trend > 0 ? '' : 'rotate-180'} />
          <span>同比 {Math.abs(trend)}%</span>
        </div>
      )}
    </div>
  </div>
);

interface TurbineNodeProps {
  id: string;
  status: TurbineStatus;
  onClick: () => void;
  isSelected: boolean;
}

const TurbineNode: React.FC<TurbineNodeProps> = ({ id, status, onClick, isSelected }) => {
  const colors = {
    normal: "bg-neon-green",
    warning: "bg-neon-yellow",
    critical: "bg-neon-red",
    offline: "bg-gray-400",
  };

  const glow = isSelected ? "ring-2 ring-neon-blue ring-offset-2 ring-offset-white scale-110 bg-white shadow-lg" : "opacity-80 hover:opacity-100 hover:scale-105 hover:shadow-md bg-white/80";

  return (
    <button
      onClick={onClick}
      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 ${glow} border border-aero-border`}
    >
      <div className={`w-3 h-3 rounded-full ${colors[status]} ${isSelected ? 'shadow-[0_0_8px_currentColor]' : ''}`}></div>
      <span className="absolute -bottom-5 text-[10px] font-mono text-slate-400">{id}</span>
    </button>
  );
};

// --- VISUALIZERS ---

// 3D-like CSS Turbine
const TurbineVisual = ({ speed, direction }: { speed: number, direction: number }) => {
  // Speed determines rotation duration. 5m/s -> 5s, 20m/s -> 0.5s
  const rotationDuration = Math.max(0.2, 5 - (speed / 5));
  
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-slate-100/50 rounded-lg border border-aero-border">
      {/* Compass Floor */}
      <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
        <div className="w-32 h-32 rounded-full border-2 border-slate-300 flex items-center justify-center">
          <div className="absolute top-0 text-[10px] font-mono font-bold text-slate-400">N</div>
          <div className="absolute right-0 text-[10px] font-mono font-bold text-slate-400">E</div>
          <div className="absolute bottom-0 text-[10px] font-mono font-bold text-slate-400">S</div>
          <div className="absolute left-0 text-[10px] font-mono font-bold text-slate-400">W</div>
        </div>
      </div>

      {/* Data Overlay */}
      <div className="absolute top-4 left-4 z-20">
        <div className="text-xs text-slate-500 font-mono">偏航角 (Yaw)</div>
        <div className="text-xl font-bold text-slate-800">{direction.toFixed(1)}°</div>
      </div>
      <div className="absolute top-4 right-4 z-20 text-right">
        <div className="text-xs text-slate-500 font-mono">转子转速</div>
        <div className="text-xl font-bold text-slate-800">{(speed * 1.2).toFixed(1)} rpm</div>
      </div>

      {/* Turbine Group */}
      <div 
        className="relative transition-transform duration-1000 ease-in-out z-10"
        style={{ transform: `rotate(${direction}deg)` }}
      >
        {/* Nacelle */}
        <div className="w-8 h-16 bg-slate-700 rounded-full relative shadow-xl border border-slate-600">
           {/* Hub */}
           <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-300 rounded-full z-20 border border-slate-400"></div>
           
           {/* Blades Container */}
           <div 
             className="absolute -top-2 left-1/2 -translate-x-1/2 w-[200px] h-[200px] -ml-[100px] -mt-[100px] z-10 origin-center flex items-center justify-center"
             style={{ animation: `spin ${rotationDuration}s linear infinite` }}
           >
             {/* Blade 1 */}
             <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-[90px] bg-gradient-to-b from-slate-200 to-white rounded-full shadow-sm origin-bottom"></div>
             {/* Blade 2 */}
             <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-[90px] bg-gradient-to-b from-slate-200 to-white rounded-full shadow-sm origin-bottom rotate-[120deg]"></div>
             {/* Blade 3 */}
             <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-[90px] bg-gradient-to-b from-slate-200 to-white rounded-full shadow-sm origin-bottom rotate-[240deg]"></div>
           </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

// TSEG Graph Visualizer - Linked to main simulation
const TsegGraphVisualizer = ({ activePatternId }: { activePatternId: number }) => {
  const nodes = [
    { id: 0, label: "平稳风", x: 50, y: 50 },
    { id: 1, label: "突发攀升", x: 80, y: 20 },
    { id: 2, label: "突发骤降", x: 20, y: 20 },
    { id: 3, label: "持续大风", x: 80, y: 80 },
    { id: 4, label: "风向偏转", x: 20, y: 80 },
  ];

  // Edges: from -> to
  const edges = [
    { from: 0, to: 1 }, { from: 0, to: 2 }, { from: 0, to: 4 },
    { from: 1, to: 3 }, { from: 2, to: 0 },
    { from: 4, to: 0 }, { from: 3, to: 0 }
  ];

  return (
    <div className="h-full w-full relative bg-slate-50 rounded-lg overflow-hidden border border-aero-border flex flex-col">
      <div className="absolute top-2 left-3 z-10 text-xs font-mono text-slate-500 flex items-center gap-2">
        <Network size={14} />
        <span>演化状态拓扑</span>
      </div>
      
      <div className="flex-1 relative mt-6">
        <svg className="w-full h-full absolute inset-0 pointer-events-none">
           {edges.map((edge, idx) => {
             const from = nodes.find(n => n.id === edge.from)!;
             const to = nodes.find(n => n.id === edge.to)!;
             const isActive = from.id === activePatternId || to.id === activePatternId;
             return (
               <line 
                 key={idx}
                 x1={`${from.x}%`} y1={`${from.y}%`} 
                 x2={`${to.x}%`} y2={`${to.y}%`}
                 stroke={isActive ? "#0ea5e9" : "#cbd5e1"}
                 strokeWidth={isActive ? 2 : 1}
                 strokeDasharray={isActive ? "none" : "4 4"}
                 className="transition-colors duration-300"
               />
             );
           })}
        </svg>

        {nodes.map((node) => {
          const isActive = node.id === activePatternId;
          return (
            <div 
              key={node.id}
              className={`absolute w-16 h-16 -ml-8 -mt-8 rounded-full border-2 flex flex-col items-center justify-center transition-all duration-500 z-10 bg-white
                ${isActive ? 'border-neon-blue shadow-[0_0_15px_rgba(14,165,233,0.3)] scale-110' : 'border-slate-300 opacity-70 scale-90'}
              `}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
            >
              <div className={`w-2 h-2 rounded-full mb-1 ${isActive ? 'bg-neon-blue animate-ping' : 'bg-slate-300'}`}></div>
              <span className={`text-[10px] font-bold text-center leading-tight ${isActive ? 'text-neon-blue' : 'text-slate-400'}`}>
                {node.label}
              </span>
              {/* Mini Shapelet Line */}
              <div className="w-8 h-4 mt-1 opacity-50">
                 <svg width="100%" height="100%" viewBox="0 0 10 5">
                   <path 
                     d={node.id === 0 ? "M0,2.5 L10,2.5" : node.id === 1 ? "M0,4 L5,1 L10,1" : node.id === 2 ? "M0,1 L5,4 L10,4" : "M0,4 Q5,0 10,4"}
                     fill="none"
                     stroke={isActive ? "#0ea5e9" : "#94a3b8"}
                     strokeWidth="1"
                   />
                 </svg>
              </div>
            </div>
          )
        })}
      </div>
      
      <div className="h-8 bg-white border-t border-aero-border flex items-center justify-between px-4 text-[10px] text-slate-500 font-mono">
         <span>当前激活子片段: ID_0{activePatternId}</span>
         <span className="flex items-center gap-1">
           <div className={`w-1.5 h-1.5 rounded-full ${activePatternId !== 0 ? 'bg-neon-purple' : 'bg-slate-300'}`}></div>
           {nodes.find(n => n.id === activePatternId)?.label}
         </span>
      </div>
    </div>
  );
};

const App = () => {
  const [selectedFarm, setSelectedFarm] = useState<1 | 2>(1);
  const [selectedTurbine, setSelectedTurbine] = useState<string>("m01");
  const [timeRange, setTimeRange] = useState<"1h" | "12h" | "24h">("1h");
  const [modelType, setModelType] = useState<ModelType>("TSEG");
  const [isPlaying, setIsPlaying] = useState(true); // Default to playing to show off animation

  // Mock Data Generation
  const [data, setData] = useState<DataPoint[]>([]);

  useEffect(() => {
    // Initial Load
    const steps = timeRange === "1h" ? 20 : 50;
    setData(generateTimeSeriesData(steps, 0.2, modelType));
  }, [timeRange, selectedTurbine, modelType]);

  // Simulation Loop
  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setData(prev => {
          if (prev.length === 0) return prev;
          
          const lastPoint = prev[prev.length - 1];
          const nextTime = new Date(); // Mock time progression
          // In a real app, parsing lastPoint.time would be needed.
          
          // Generate ONE new point based on the last state logic roughly
          // For visual smoothness, we simply re-generate the whole array but shifted
          // To keep the "Linked Graph" correct, we need consistent logic.
          
          const newBatch = generateTimeSeriesData(prev.length, 0.2, modelType);
          // Keep the time continuity illusion if we were really streaming
          return newBatch; 
        });
      }, 2000); // slower update for visual digestion
    }
    return () => clearInterval(interval);
  }, [isPlaying, modelType]);

  // Generate Turbine List
  const turbines = useMemo(() => {
    const list: Turbine[] = [];
    const start = selectedFarm === 1 ? 1 : 26;
    const end = selectedFarm === 1 ? 25 : 50;
    
    for (let i = start; i <= end; i++) {
      const id = `m${i.toString().padStart(2, '0')}`;
      const rand = Math.random();
      let status: TurbineStatus = "normal";
      if (rand > 0.9) status = "warning";
      if (rand > 0.98) status = "critical";
      
      list.push({
        id,
        farmId: selectedFarm,
        status,
        windSpeed: Math.random() * 15 + 5,
        power: Math.random() * 2000 + 500,
        direction: Math.random() * 360,
        temperature: 20 + Math.random() * 10
      });
    }
    return list;
  }, [selectedFarm]);

  const currentTurbineData = turbines.find(t => t.id === selectedTurbine) || turbines[0];
  const latestDataPoint = data[data.length - 1] || { actualSpeed: 0, actualDir: 0, activePatternId: 0 };

  // Metrics based on Model Type
  const getMetrics = (model: ModelType) => {
    switch (model) {
      case "TSEG": return { mae: "0.42 m/s", rmse: "0.58 m/s" };
      case "TCN": return { mae: "0.65 m/s", rmse: "0.82 m/s" };
      case "GRU": return { mae: "0.85 m/s", rmse: "1.05 m/s" };
      case "LSTM": return { mae: "0.89 m/s", rmse: "1.12 m/s" };
      case "ARIMA": return { mae: "1.24 m/s", rmse: "1.56 m/s" };
    }
  };
  const metrics = getMetrics(modelType);

  // Export CSV Handler
  const handleExportCSV = () => {
    if (!data || data.length === 0) {
      alert("暂无数据可导出");
      return;
    }

    // Define Headers
    const headers = ["时间(Time)", "实测风速(m/s)", "预测风速(m/s)", "基准预测(m/s)", "实测风向(°)", "预测风向(°)", "激活模式ID"];
    
    // Map Data
    const rows = data.map(row => [
      row.time,
      row.actualSpeed.toFixed(2),
      row.predictedSpeed.toFixed(2),
      row.baselineSpeed.toFixed(2),
      row.actualDir.toFixed(1),
      row.predictedDir.toFixed(1),
      row.activePatternId || 0
    ].join(","));

    // Combine with BOM for Excel UTF-8 compatibility
    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    
    // Create Blob and Link
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${selectedTurbine}_prediction_data_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-aero-bg text-aero-text-primary font-sans selection:bg-neon-blue selection:text-white pb-12">
      <div className="fixed inset-0 grid-bg pointer-events-none z-0 opacity-40"></div>
      
      <Header />

      <main className="relative z-10 p-6 max-w-[1920px] mx-auto grid grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: NAVIGATION & MAP */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
          {/* Farm Selector */}
          <div className="glass-panel p-1 rounded-lg flex bg-slate-100 border-aero-border">
            <button 
              onClick={() => setSelectedFarm(1)}
              className={`flex-1 py-2 text-sm font-bold rounded shadow-sm transition-all ${selectedFarm === 1 ? 'bg-white text-neon-blue ring-1 ring-gray-200' : 'text-slate-500 hover:text-slate-800'}`}
            >
              风电场 01 (沿海)
            </button>
            <button 
              onClick={() => setSelectedFarm(2)}
              className={`flex-1 py-2 text-sm font-bold rounded shadow-sm transition-all ${selectedFarm === 2 ? 'bg-white text-neon-purple ring-1 ring-gray-200' : 'text-slate-500 hover:text-slate-800'}`}
            >
              风电场 02 (山谷)
            </button>
          </div>

          {/* Turbine Grid Map */}
          <div className="glass-panel p-6 rounded-xl flex-1 min-h-[400px]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-slate-800 font-mono font-bold flex items-center gap-2">
                <MapIcon size={16} className="text-neon-blue"/> 
                机组阵列概览
              </h3>
              <div className="flex gap-2 text-[10px] uppercase font-mono">
                <span className="flex items-center gap-1 text-slate-500"><div className="w-2 h-2 bg-neon-green rounded-full"></div> 正常</span>
                <span className="flex items-center gap-1 text-slate-500"><div className="w-2 h-2 bg-neon-yellow rounded-full"></div> 预警</span>
                <span className="flex items-center gap-1 text-slate-500"><div className="w-2 h-2 bg-neon-red rounded-full"></div> 告警</span>
              </div>
            </div>
            
            <div className="grid grid-cols-5 gap-4 place-items-center">
              {turbines.map((t) => (
                <TurbineNode 
                  key={t.id} 
                  id={t.id} 
                  status={t.status} 
                  isSelected={selectedTurbine === t.id}
                  onClick={() => setSelectedTurbine(t.id)}
                />
              ))}
            </div>
          </div>

          {/* System Status */}
          <div className="glass-panel p-6 rounded-xl">
            <h3 className="text-slate-800 font-mono text-sm mb-4 border-b border-aero-border pb-2">系统健康状态</h3>
            <div className="space-y-4 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">SCADA 延迟</span>
                <span className="text-neon-green font-bold">24ms</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">GPU 负载 (TSEG)</span>
                <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-neon-purple w-[45%]"></div>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">数据完整性</span>
                <span className="text-neon-blue font-bold">99.9%</span>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: MAIN VISUALIZATION */}
        <div className="col-span-12 lg:col-span-6 flex flex-col gap-6">
          
          {/* Title & Controls */}
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-3xl font-bold text-slate-800 mb-1">{selectedTurbine.toUpperCase()} 实时遥测</h2>
              <p className="text-slate-500 font-mono text-xs flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                坐标: {selectedFarm === 1 ? "112.45E, 22.31N" : "103.22E, 24.11N"} // 实时数据流
              </p>
            </div>
            <div className="flex gap-2">
               <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className={`p-2 rounded border border-aero-border hover:bg-white hover:shadow-md transition-all ${isPlaying ? 'text-neon-green bg-white' : 'text-slate-500 bg-slate-50'}`}
               >
                 {isPlaying ? <Pause size={20}/> : <Play size={20} />}
               </button>
               <button className="p-2 rounded border border-aero-border bg-slate-50 hover:bg-white hover:shadow-md transition-all text-slate-500">
                 <SkipForward size={20} />
               </button>
               <button 
                 className="flex items-center gap-2 px-4 py-2 rounded bg-slate-800 hover:bg-slate-900 transition-colors text-white text-sm font-mono shadow-lg shadow-slate-200"
                 onClick={handleExportCSV}
               >
                 <Download size={16} /> 导出 CSV
               </button>
            </div>
          </div>

          {/* Main Chart */}
          <div className="glass-panel p-6 rounded-xl h-[450px] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div className="flex gap-4">
                <h3 className="font-mono text-slate-800 font-bold">机舱风速 (m/s)</h3>
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="w-3 h-0.5 bg-blue-600"></span> 实测值
                  <span className="w-3 h-0.5 bg-neon-green border-t border-dashed border-neon-green"></span> {modelType}预测
                  <span className="w-3 h-0.5 bg-neon-red border-t border-dashed border-neon-red opacity-50"></span> 基准(LSTM)
                </div>
              </div>
              <div className="flex bg-slate-100 rounded p-1 border border-aero-border">
                {["1h", "12h", "24h"].map((r) => (
                  <button 
                    key={r}
                    onClick={() => setTimeRange(r as any)}
                    className={`px-3 py-1 text-xs font-mono rounded ${timeRange === r ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="colorSpeed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    stroke="#94a3b8" 
                    tick={{fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono'}} 
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    tick={{fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono'}} 
                    tickLine={false}
                    domain={[0, 30]}
                  />
                  <Tooltip 
                    contentStyle={{backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#0f172a', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}}
                    itemStyle={{fontFamily: 'JetBrains Mono', fontSize: '12px'}}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="actualSpeed" 
                    name="实测风速"
                    stroke="#2563eb" 
                    strokeWidth={2} 
                    fillOpacity={1} 
                    fill="url(#colorSpeed)" 
                    activeDot={{r: 6, fill: '#2563eb', stroke: 'white', strokeWidth: 2}}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="predictedSpeed" 
                    name={`${modelType}预测`}
                    stroke="#10b981" 
                    strokeWidth={2} 
                    strokeDasharray="5 5" 
                    dot={false} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="baselineSpeed" 
                    name="基准(LSTM)"
                    stroke="#f43f5e" 
                    strokeWidth={2} 
                    strokeDasharray="3 3" 
                    opacity={0.4} 
                    dot={false} 
                  />
                  {/* Highlight sudden change zones as per PDF "gust prediction" */}
                  <ReferenceArea x1={data[Math.floor(data.length/2)]?.time} x2={data[Math.floor(data.length/2)+2]?.time} strokeOpacity={0} fill="#8b5cf6" fillOpacity={0.05} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Secondary Charts Row */}
          <div className="grid grid-cols-2 gap-6 h-[250px]">
            
            {/* 3D Turbine Visualizer */}
            <div className="glass-panel p-4 rounded-xl flex flex-col">
               <h3 className="font-mono text-slate-800 font-bold text-sm mb-2 flex items-center gap-2">
                 <Fan size={14} /> 机组实时姿态
               </h3>
               <div className="flex-1">
                 <TurbineVisual 
                    speed={latestDataPoint.actualSpeed} 
                    direction={latestDataPoint.actualDir} 
                 />
               </div>
            </div>

            {/* Linked Pattern Graph */}
            <div className="glass-panel p-4 rounded-xl flex flex-col relative overflow-hidden">
               <h3 className="font-mono text-slate-800 font-bold text-sm mb-2 flex items-center gap-2 z-10">
                 <Layers size={14} /> 时序演化图 (TSEG)
               </h3>
               <div className="flex-1 z-10">
                 <TsegGraphVisualizer activePatternId={latestDataPoint.activePatternId || 0} />
               </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: ANALYTICS & CONFIG */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
           
           {/* Stats Grid */}
           <div className="grid grid-cols-1 gap-4">
             <StatCard 
              label="当前风速" 
              value={latestDataPoint.actualSpeed.toFixed(1)} 
              unit="m/s" 
              icon={Wind} 
              color="text-blue-500"
              trend={12} 
             />
             <StatCard 
              label="有功功率" 
              value={Math.round(currentTurbineData.power)} 
              unit="kW" 
              icon={Zap} 
              color="text-yellow-500" 
             />
             <StatCard 
              label="预测置信度" 
              value={modelType === 'TSEG' ? '94.2' : '81.5'} 
              unit="%" 
              icon={Activity} 
              color="text-emerald-500" 
             />
           </div>

           {/* Model Controller */}
           <div className="glass-panel p-6 rounded-xl">
             <h3 className="text-slate-800 font-mono font-bold mb-4 flex items-center gap-2">
               <Cpu size={16} className="text-slate-500"/> 模型对比配置
             </h3>
             
             <div className="space-y-2 mb-6 overflow-y-auto max-h-[200px] pr-1">
               {(['TSEG', 'TCN', 'GRU', 'LSTM', 'ARIMA'] as const).map(m => (
                 <button 
                  key={m}
                  onClick={() => setModelType(m)}
                  className={`w-full flex items-center justify-between p-3 rounded border transition-all ${modelType === m ? 'border-neon-green bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-100' : 'border-aero-border text-slate-500 hover:border-slate-300 hover:bg-slate-50'}`}
                 >
                   <span className="font-bold text-sm font-mono">{m}</span>
                   {modelType === m && <div className="w-2 h-2 bg-neon-green rounded-full shadow-[0_0_4px_currentColor]"></div>}
                 </button>
               ))}
             </div>

             <div className="bg-slate-100 rounded p-4 border border-aero-border">
               <h4 className="text-xs text-slate-500 mb-2 uppercase tracking-widest">预测误差指标 (MAE/RMSE)</h4>
               <div className="flex justify-between items-center mb-2">
                 <span className="text-sm font-mono text-slate-600">MAE (平均绝对误差)</span>
                 <span className={`font-mono font-bold ${modelType === 'TSEG' ? 'text-emerald-600' : 'text-rose-500'}`}>{metrics.mae}</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-sm font-mono text-slate-600">RMSE (均方根误差)</span>
                 <span className={`font-mono font-bold ${modelType === 'TSEG' ? 'text-emerald-600' : 'text-rose-500'}`}>{metrics.rmse}</span>
               </div>
             </div>
           </div>

           {/* Alert/Event Log */}
           <div className="glass-panel p-6 rounded-xl flex-1">
             <h3 className="text-slate-800 font-mono font-bold mb-4 flex items-center gap-2">
               <AlertTriangle size={16} className="text-amber-500" /> 实时风况告警
             </h3>
             <div className="space-y-3">
               {[1,2,3].map((i) => (
                 <div key={i} className="flex gap-3 items-start text-xs border-b border-aero-border pb-2 last:border-0">
                   <span className="text-slate-400 font-mono">10:{15 + i*5}</span>
                   <div>
                     <p className="text-slate-800 font-bold">模式 ID_0{i}: 突发风切变</p>
                     <p className="text-slate-500">预测置信度: {(0.9 + Math.random()*0.09).toFixed(2)}</p>
                   </div>
                 </div>
               ))}
             </div>
           </div>

        </div>

      </main>
    </div>
  );
};

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}