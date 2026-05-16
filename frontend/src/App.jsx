import { useEffect, useRef } from 'react'
import {useParams} from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import axios from 'axios'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Counter />
    </QueryClientProvider>
  )
}

function Counter() {
  const { numb } = useParams();
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['counter'],
    queryFn: async () => {
      const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/counter`, {params: { numb }})
      console.log(data)
      return data.value
    },
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await axios.patch(`${import.meta.env.VITE_API_URL}/counter`, {numb : numb}, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    })
      console.log(data)
      return data.value
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['counter'] })
      const previous = queryClient.getQueryData(['counter'])
      queryClient.setQueryData(['counter'], (old) => old + 1)
      return { previous }
    },
    onError: (err, _,) => {
      queryClient.setQueryData(['counter'], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['counter'] })
    },
  })

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        queryClient.setDefaultOptions({ queries: { refetchInterval: false } })
      } else {
        queryClient.setDefaultOptions({ queries: { refetchInterval: 10000 } })
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [queryClient])

  if (isLoading) return <div className="flex justify-center items-center h-screen">Загрузка...</div>
  
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="text-center space-y-6">
        <h1 className="text-5xl font-bold text-gray-800">
          Счётчик: <span className="text-blue-600">{data ?? '-'}</span>
        </h1>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className={`
            px-10 py-4 text-2xl font-semibold rounded-xl
            bg-blue-600 text-white shadow-lg
            hover:bg-blue-700 active:bg-blue-800
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200 transform hover:scale-105
          `}
        >
          +1
        </button>
        <Camera />
      </div>
    </div>
  )
}

function Camera() {

  const imgRef = useRef()

useEffect(() => {
  console.log("Пытаемся подключиться к WS");

  //const ws = new WebSocket("wss://accidentpaneldetector.onrender.com/ws");
  const ws = new WebSocket("ws://localhost:8000/ws");

  ws.onopen = () => {
    console.log("WebSocket открыт — соединение установлено");
  };

ws.onmessage = (event) => {
  if (event.data === "ping") {
    ws.send("pong");
    return;
  }
    //console.log("Получено сообщение, длина base64:", event.data.length);
    imgRef.current.src = "data:image/jpeg;base64," + event.data;
  };

  ws.onerror = (err) => {
    console.error("WebSocket ошибка:", err);
  };

  ws.onclose = (event) => {
    console.log("WebSocket закрыт", event.code, event.reason);
  };

  return () => {
    ws.close();
  };
}, []);

  return <img ref={imgRef}/>
}


export default App