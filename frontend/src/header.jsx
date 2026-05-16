import React, { useState, useEffect, useRef, memo, useCallback,  createContext, useContext  } from 'react';
import axios from 'axios';

import {deleteRout,N,isValidDate,MaxIdRout,routTime,secondsToTime,
secondsToTime2,secondsToTime3,timeToTime,calculateDelay, handle, otheme,TSK,TSK2, isMobileOrNarrow}
from './functions.jsx';
import Enter from './Enter.jsx';

const Header = ({handleLogout, Shapka, User, setUser, theme, isWide, setPanelDict, RD, changeUrl, backurl}) => {  
      const [HeaderDict, setHeaderDict] = useState({})
      const currentTime = useRef(null); // привязать к DOM-элементу
      const { notifications, toasts, notify, clear } = useNotify();

      const timeRef = useRef(Date.now());
      useEffect(() => {
        const id = setInterval(() => {
          timeRef.current = Date.now();
          if (currentTime.current) {
            currentTime.current.textContent = new Date(timeRef.current).toLocaleTimeString();
          }
        }, 1000);
        return () => clearInterval(id);
      }, []);


      if(!isWide){
        return (<><header
          className={`fixed w-full z-20
          ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-gray-800'}
          shadow-md p-4
        `}
    >
    
      {/* первая строка */}
      <div className="grid grid-cols-3 items-center md:flex md:justify-between">
    
        {/* выход */}
        <div className="justify-self-start">
          <button
            onClick={handleLogout}
            className="logout-icon text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
            title="Выход"
          />
        </div>
    
        {/* центр */}
        <div className="flex justify-center gap-4 text-lg font-semibold tracking-tight">
          <span ref={currentTime} />
    
          <button
            onClick={() => {setHeaderDict(prev => ({ ...prev, Profile: true  }))}}
            className={`${theme === 'dark'
              ? 'text-white hover:text-indigo-400'
              : 'text-gray-800 hover:text-indigo-600'} transition-colors`}
          >
            {User.name}
          </button>
        </div>
    
        {/* settings */}
        <div className="justify-self-end">
          <button
            onClick={() => {setPanelDict(prev => ({ ...prev, SettingsPanel: true  }))}}
            className="settings-icon text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
            title="Настройки"
          />
        </div>
    
      </div>
    
      {/* центральный элемент */}
      <div className="flex items-center gap-3 justify-center mt-3 md:mt-0 md:absolute md:left-1/2 md-transform md:-translate-x-1/2">
        <NotificationSystem
          theme={theme}
          notifications={notifications}
          toasts={toasts}
          notify={notify}
          clear={clear}
        />
        {(() => {
          console.log(Shapka)
          if (Object.keys(Shapka).length > 1){
            return(
              <select
                value={Shapka.title}
                onChange={(e) => {
                  Shapka.body[e.target.value]?.()
                }}
                className={`p-3 text-xl font-bold ${
                  theme === 'dark'
                  ? 'bg-gray-800 text-white border-gray-600'
                  : 'bg-white text-indigo-900 border-indigo-300'
                } border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400`}
              >
                <option
                  key={Object.keys(Shapka.title)}
                  value={Object.keys(Shapka.title)}
                >
                  {Object.keys(Shapka.title)}
                </option>
    
                {Object.entries(Shapka.body).map(([key,value])=>{
                  if(key!=Object.keys(Shapka.title)){
                    return <option key={key} value={key}>{key}</option>
                  }
                  return null
                })}
              </select>
            )
          }
    
          return(
            <p className={`text-lg font-semibold ${
              theme === 'dark'
              ? 'text-white hover:text-indigo-400'
              : 'text-gray-800 hover:text-indigo-600'
            }`}>
              {Shapka.title}
            </p>
          )
        })()}
    
      </div>
      {HeaderDict.Profile && <ProfilePanel backurl = {backurl} changeUrl={changeUrl} User = {User} setUser={setUser} OE = {() => {setHeaderDict(prev => ({ ...prev, CodePanel: true  }))}} OP = {() => {setHeaderDict(prev => ({ ...prev, PasswordPanel: true  }))}} RD = {RD} OS = {() => {setPanelDict(prev => ({ ...prev, SavePanel: true  })) }}  theme = {theme} Close = {() => {setHeaderDict(prev => ({ ...prev, Profile: false  }))}}/>}
      {HeaderDict.CodePanel && <VerifyCodeModal email = {RD.email} backurl={backurl} Next = {RD.Next} theme = {theme} Close = {() => {setHeaderDict(prev => ({ ...prev, CodePanel: false  }))}}/>}
      {HeaderDict.PasswordPanel && <ChangePasswordModal data = {User} backurl={backurl} Next = {RD.Next} theme = {theme} Close = {() => {setHeaderDict(prev => ({ ...prev, PasswordPanel: false  }))}}/>}
    
    </header><div style={{ height: '140px'}}></div></>)
  }else{
  return (<><header className={`${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-gray-800'}  fixed w-full z-20 shadow-md p-5 flex items-center justify-between`}>
              <button
                onClick={handleLogout}
                className="logout-icon text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
                title="Выход"
              ></button>
              <div className="text-lg font-semibold tracking-tight"><span ref={currentTime} /></div>
                <div className="flex items-center gap-3"><NotificationSystem
                theme={theme}
                notifications={notifications}
                toasts={toasts}
                notify={notify}
                clear={clear}
              />
              {(() => {
                console.log(Shapka)
                if (Object.keys(Shapka).length > 1){

              return(<select
                style={{width : 'auto'}}
                value={Shapka.title}
                onChange={(e) => {Shapka.body[e.target.value]?.()}}
                className={`w-64 p-3 text-xl font-bold ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white text-indigo-900 border-indigo-300'} border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all pr-10`}
              >
                <option key={Object.keys(Shapka.title)} value={Object.keys(Shapka.title)}>{Object.keys(Shapka.title)}</option>
                {Object.entries(Shapka.body).map(([key, value], ind) => {
                   if (key !=  Object.keys(Shapka.title)){return <option key = {ind} onClick={value} value={key}>{key}</option>}
                  //return null
                })}
              </select>)}else{return(<p className={`text-lg font-semibold ${theme === 'dark' ? 'text-white hover:text-indigo-400' : 'text-gray-800 hover:text-indigo-600'} transition-colors`}>{Shapka.title}</p>)}})()}
              </div>
              <button
                onClick={() => {setHeaderDict(prev => {prev.Profile = true;return { ...prev }; });}}
                className={`text-lg font-semibold ${theme === 'dark' ? 'text-white hover:text-indigo-400' : 'text-gray-800 hover:text-indigo-600'} transition-colors`}
              >
                {User.name}
              </button>
              <button
                onClick={() => {setPanelDict(prev => {prev.SettingsPanel = true;return { ...prev }; });}}
                className="settings-icon text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
                title="Настройки"
              ></button>
            {HeaderDict.Profile && <ProfilePanel  backurl = {backurl} changeUrl={changeUrl} User = {User} setUser={setUser} OE = {() => {setHeaderDict(prev => ({ ...prev, CodePanel: true  }))}} OP = {() => {setHeaderDict(prev => ({ ...prev, PasswordPanel: true  }))}} RD = {RD} OS = {() => {setPanelDict(prev => ({ ...prev, SavePanel: true  })) }}  theme = {theme} Close = {() => {setHeaderDict(prev => ({ ...prev, Profile: false  }))}}/>}
            {HeaderDict.CodePanel && <VerifyCodeModal email = {RD.email} backurl={backurl} Next = {RD.Next} theme = {theme} Close = {() => {setHeaderDict(prev => ({ ...prev, CodePanel: false  }))}}/>}
            {HeaderDict.PasswordPanel && <ChangePasswordModal data = {User} backurl={backurl} Next = {RD.Next} theme = {theme} Close = {() => {setHeaderDict(prev => ({ ...prev, PasswordPanel: false  }))}}/>}
            
            </header><div style={{ height: '109px'}}></div></>)
}}

const SavePanel = ({RD, Close, theme, Next, email,  data, setData, backurl}) => {
  const [Input, setInput] = useState(RD.val);
  //console.log(theme)    
  const FO = () => {
    if (Input === '' || String(Input) === 'undefined') {
      console.error('Input пустой, обновление отменено');
      return}
    if (RD.tip[0] === 'email') {
      console.log(Input)
      email.current = Input
      Next()
      Close()
    }else{ TSK(RD.tip, RD.task, Input, data, setData);Close()}};
  //return ('<div></div>')
  return (<div className="modal-overlay">
                <div className={`modal-content`}style={{ background: theme === 'dark' ? 'black' : 'white' }}>
                  <div className="flex justify-between items-center mb-6">
                    <h3 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-indigo-900'} tracking-tight`}>{RD.task} {RD.tip[RD.tip.length-1]}</h3>
                    <button
                      onClick={Close}
                      className={`close-icon ${theme === 'dark' ? 'text-gray-400 hover:text-red-400' : 'text-gray-500 hover:text-red-500'} transition-transform`}
                    ></button>
                  </div>
                  <input
                    autoFocus
                    type="text"
                    value={Input || ''}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {if (e.key === 'Enter') {FO()}}}
                    placeholder=""
                    className= {`w-full p-4 mb-6 text-lg  ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600' : 'bg-gray-200 text-gray-900 border-gray-300'} rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all`}
                  />
                  <button
                    onClick={() => (FO())}
                    className="w-full bg-gradient-to-r from-indigo-600 to-blue-500 text-white py-3 rounded-xl hover:from-indigo-700 hover:to-blue-600 transition-all shadow-lg font-semibold"
                  >
                    {RD.task + ' ' + RD.tip[RD.tip.length-1] + ' ' + Input}
                  </button>
                </div>
              </div>
            )
}


const SavePanel2 = ({ Close, theme, tip, task, data, setData, dt, changeUrl, dataO, setDataO }) => {
  const [input, setInput] = useState('');

  useEffect(() => {
    if (task !== 'Add') setInput(dt);
  }, [dt, task]);

  const handleSubmit = () => {
    if (input.trim() === '') return;
    console.log(tip, task, input, data, dt, changeUrl, dataO)
    TSK2(tip, task, input, data, setData, dt, changeUrl, dataO, setDataO);
    Close();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
                  <div className="flex justify-between items-center mb-6">
            <h3 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-indigo-900'} tracking-tight`}>{task} {tip}</h3>
            <button
              onClick={Close}
              className={`close-icon ${theme === 'dark' ? 'text-gray-400 hover:text-red-400' : 'text-gray-500 hover:text-red-500'} transition-transform`}
            ></button>
          </div>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder=""
            className= {`w-full p-4 mb-6 text-lg  ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600' : 'bg-gray-200 text-gray-900 border-gray-300'} rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all`}
          />
        <button onClick={handleSubmit}
        className="w-full bg-gradient-to-r from-indigo-600 to-blue-500 text-white py-3 rounded-xl hover:from-indigo-700 hover:to-blue-600 transition-all shadow-lg font-semibold"
>
          {task} {tip} {input}
        </button>
      </div>
    </div>
  );
};

const ProfilePanel = ({Close, theme, User, setUser, RD, OS, OE, OP, changeUrl, backurl, setData}) => {
      const [LocalDict, setLocalDict] = useState({})
      const [value, setValue] = useState(User.numb)
      const [NF, setNF] = useState()
      const email = useRef('');

      useEffect(() => {
        email.current = User.email || '';
      }, [User.email]);

      useEffect(() => {setValue(User.numb)}, [User.numb])

      const logout = () => {
            axios.post(`${backurl}/views`, {fun : 'logout'}, {withCredentials: true}, {credentials: "include"})
        }
        
      
      const C = (tip) => {
        let NF2
        console.log(tip, email.current)
        if(tip === 'E1' || tip === 'P1'){
          email.current = User.email
          setLocalDict(prev => ({ ...prev, CodePanel: true  }))
          NF2 = () => {
            C(tip + 2);      
          };}
        if(tip === 'E12'){
          setLocalDict(prev => ({ ...prev, savepanel: true  }))
          NF2 = () => {
            C(tip + 3);      
          };}        
        if(tip === 'E123'){
          setLocalDict(prev => ({ ...prev, CodePanel: true  }))
          NF2 = () => {
            C(tip + 4);      
          };}        
        if(tip === 'E1234'){
            if(email.current !== '----'){
            setUser(prev => {
            return { ...prev, 'email': email.current };
          });}else{console.log(email.current)}}
        if(tip === 'P12'){
          console.log(User)
          setLocalDict(prev => ({ ...prev, PasswordPanel: true  }))
          NF2 = () => {
            C(tip + 3);      
          };}  
        if(tip === 'P123'){}
        setNF(() => NF2);}
      

      if(User.email === User.numb ){
        return <Enter theme = {theme} backurl = {backurl} changeUrl = {changeUrl} tip = {'op'} Close = {Close}/>
      }else{
      return (
        <div className={`modal-overlay min-h-screen ${theme === 'dark' ? 'bg-gradient-to-b from-gray-800 to-gray-900' : 'bg-gradient-to-b from-indigo-50 to-gray-100'} flex items-center justify-center p-6`}>
          <div className={`w-full max-w-md ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-3xl shadow-lg p-8`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-indigo-900'} tracking-tight`}>Настройки профиля</h3>
              
              <button
                      onClick={Close}
                      className={`close-icon ${theme === 'dark' ? 'text-gray-400 hover:text-red-400' : 'text-gray-500 hover:text-red-500'} transition-transform`}
                    ></button>
            </div>
            <div className="flex items-start">
              <div className="flex flex-col items-center mr-6">
                <div className="profile-circle">{User.name.charAt(0).toUpperCase()}</div>
                <div className="mt-3 text-center">
                  <p className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-indigo-900'}`}>{User.name}</p>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>{User.email}</p>
                  <p>ㅤ</p>
                  <select
                    value={value}
                    onChange={(e) => {setValue(e.target.value); changeUrl('/' + e.target.value)}}
                    className={`w-32 p-3 text-xl font-bold ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white text-indigo-900 border-indigo-300'} border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all`}
                  > {(User.numbs).map((key) => {
                      return <option key={key} value={key}>{key}</option>
                    })}
                  </select>
                  <button onClick={() => {setUser(prev => ({ ...prev, numbs: [...prev.numbs, -1] }));}}
                      className={`text-xl ${theme === 'dark' ? 'text-green-400 hover:text-green-300' : 'text-green-600 hover:text-green-500'} transition-colors duration-200`}
                      >ㅤ+</button>
                  {User.numbs.length > 1 && <button onClick={() => {User.numbs.splice(User.numbs.indexOf(User.numb),1)}}
                    className={`text-xl ${theme === 'dark' ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-500'} transition-colors duration-200`}>
                  ㅤ✖</button>}
                </div>
              </div>
              <div className="flex-1 space-y-3">
                <button
                  onClick={() => {setLocalDict(prev => ({ ...prev, savepanel2: true  }))}}
                  className={`w-full text-left ${theme === 'dark' ? 'text-white hover:text-indigo-400' : 'text-indigo-900 hover:text-indigo-600'} transition-colors font-medium text-lg`}
                >
                  Изменить имя
                </button>
                <button
                  onClick={() => {C('E1')}} 
                  className={`w-full text-left ${theme === 'dark' ? 'text-white hover:text-indigo-400' : 'text-indigo-900 hover:text-indigo-600'} transition-colors font-medium text-lg`}
                >
                  Изменить email
                </button>
                <button
                  onClick={() => {C('P1')}}
                  className={`w-full text-left ${theme === 'dark' ? 'text-white hover:text-indigo-400' : 'text-indigo-900 hover:text-indigo-600'} transition-colors font-medium text-lg`}
                >
                  Изменить пароль
                </button>
                <button
                  className={`w-full text-left ${theme === 'dark' ? 'text-white hover:text-indigo-400' : 'text-indigo-900 hover:text-indigo-600'} transition-colors font-medium text-lg`}
                  onClick={logout} 
                >
                  Выйти
                </button>
              </div>
            </div>
          </div>
          
          {LocalDict.CodePanel && <VerifyCodeModal email = {email.current} backurl={backurl} Next = {NF} theme = {theme} Close = {() => {setLocalDict(prev => ({ ...prev, CodePanel: false  }))}}/>}
          {LocalDict.PasswordPanel && <ChangePasswordModal data = {User} backurl={backurl} Next = 'СОХРАНИТЬ ПАРОЛЬ' theme = {theme} Close = {() => {setLocalDict(prev => ({ ...prev, PasswordPanel: false  }))}}/>}

          {LocalDict.savepanel && <SavePanel data = {User} Next = {NF} changeUrl = {changeUrl} RD = {{tip: ['email'], task: 'Izm', val : User.email}} email = {email} setData = {setUser} Close = {() => setLocalDict(prev => ({ ...prev, savepanel: false  }))}/>}
          {LocalDict.savepanel2 && <SavePanel2 changeUrl = {changeUrl} task = 'Izm' tip = 'name' data = {User} setData = {setUser} dt = {User.name} Close = {() => setLocalDict(prev => ({ ...prev, savepanel2: false  }))}/>}
        </div>
      );}
    };
    const VerifyCodeModal = ({ Next, Close, email, backurl, theme}) => {
      const [code, setCode] = useState('')
      const [message, setMessage] = useState()
      const [verificationCode, setV] = useState(Math.floor(100000 + Math.random() * 900000).toString())
      const Check = () => {
            console.log(verificationCode)
            if (code === verificationCode){Close();Next()}
            else (setMessage('Не верный код!'))
      } 
      useEffect(() => {console.log('Письмо отправлено')
        axios.post(`${backurl}/views`, {fun : 'tsk', task: 'otp', tip: 'email',cod : verificationCode, email: email}, {withCredentials: true}, {credentials: "include"})
        .then(response => {console.log('Письмо отправлено')})
        .catch(error => console.error('Error find:', error))},['33'])
      return (
        <div className="modal-overlay">
          <div className={`modal-content`}style={{ background: theme === 'dark' ? 'black' : 'white' }}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-indigo-900'} tracking-tight`}>Подтверждение</h3>
              <button
                onClick={Close}
                className={`close-icon ${theme === 'dark' ? 'text-gray-400 hover:text-red-400' : 'text-gray-500 hover:text-red-500'} transition-transform`}
              ></button>
            </div>
            <div className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-4`}>
              Код отправлен на {email}, проверьте папку спам
            </div>
            <input
              type="text"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {if (e.key === 'Enter') {Check()}}}
              placeholder="Введите код подтверждения"
              className={`w-full p-4 mb-6 text-lg  ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600' : 'bg-gray-200 text-gray-900 border-gray-300'} rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all`}
            />
            <p style={{color : 'red'}}>{message}</p>
            <button
              onClick={Check}
              className="w-full bg-gradient-to-r from-indigo-600 to-blue-500 text-white py-3 rounded-xl hover:from-indigo-700 hover:to-blue-600 transition-all shadow-lg font-semibold"
              
            >
              Подтвердить
            </button>
          </div>
        </div>
      );
    };
    const ChangePasswordModal = ({Close, Next, theme,  data, backurl}) => {
    const [password1, setPassword1] = useState()
    const [password2, setPassword2] = useState()
    
      const [message, setMessage] = useState()
      const Check = () => {
        if (password1 === '' || password2 === '' ){setMessage('Недопустимый пароль')}
        else if (password1 !== password2){setMessage('Пароли не совпадают!')}
        else {if(Next === 'СОХРАНИТЬ ПАРОЛЬ'){
            axios.post(`${backurl}/views`, {fun : 'data', task: 'izmU', patch : {'delete': [], 'set': [['', password1, ['0000', 'pass']]]},  numb: '0000'}, {withCredentials: true}, {credentials: "include"})
            .then(response => {Close()})
            .catch(error => console.error('Error find:', error))
        }else{data.pass = password1;Close()}}
        //if (message === ''){ Close() }
      }



      return (
        <div className="modal-overlay">
          <div className={`modal-content`}style={{ background: theme === 'dark' ? 'black' : 'white' }}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-indigo-900'} tracking-tight`}>Изменить пароль</h3>
              <button
                onClick={Close}
                className={`close-icon ${theme === 'dark' ? 'text-gray-400 hover:text-red-400' : 'text-gray-500 hover:text-red-500'} transition-transform`}
              ></button>
            </div>
            <input
              autoFocus
              type="password"
              value={password1}
              onChange={(e) => {setPassword1(e.target.value);}}
              placeholder="Введите новый пароль"
              className={`w-full p-4 mb-6 text-lg  ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600' : 'bg-gray-200 text-gray-900 border-gray-300'} rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all`}
            />
            <input
              type="password"
              value={password2}
              onChange={(e) => {setPassword2(e.target.value);}}
              onKeyDown={(e) => {if (e.key === 'Enter') {Check()}}}
              placeholder="Подтвердите пароль"
              className={`w-full p-4 mb-6 text-lg  ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600' : 'bg-gray-200 text-gray-900 border-gray-300'} rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all`}
            />
            <p style={{color : 'red'}}>{message}</p>
            <button
              onClick={Check}
              className="w-full bg-gradient-to-r from-indigo-600 to-blue-500 text-white py-3 rounded-xl hover:from-indigo-700 hover:to-blue-600 transition-all shadow-lg font-semibold"
            >
              Сохранить
            </button>
          </div>
        </div>
      );
    };
function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [toasts, setToasts] = useState([]);
 
  const notify = useCallback((text, color = "#3b82f6") => {
    const id = Date.now() + Math.random();
    const item = { id, text, color, time: new Date() };
 
    setNotifications(prev => [item, ...prev]);
    setToasts(prev => [item, ...prev]);
 
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);
 
  const clear = useCallback(() => setNotifications([]), []);
 
  return { notifications, toasts, notify, clear };
}
 
// ─── Форматирование времени ───
function fmtTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
 
// ─── Тосты (правый верхний угол) ───
function Toasts({ toasts, theme }) {
  const dark = theme === "dark";
 
  return (
    <div style={{
      position: "fixed", top: 16, right: 16, zIndex: 9999,
      display: "flex", flexDirection: "column", gap: 8,
      pointerEvents: "none",
    }}>
      {toasts.map((t, i) => (
        <div key={t.id} style={{
          background: dark ? "#1e1e2e" : "#fff",
          border: `2px solid ${t.color}`,
          borderRadius: 12,
          padding: "10px 16px",
          boxShadow: `0 4px 24px ${t.color}44`,
          display: "flex", alignItems: "center", gap: 10,
          animation: "toast-in 0.35s ease-out",
          minWidth: 220, maxWidth: 360,
          pointerEvents: "auto",
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%",
            background: t.color, flexShrink: 0,
            boxShadow: `0 0 8px ${t.color}`,
          }} />
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 13, fontWeight: 600,
              color: dark ? "#e2e8f0" : "#1a1a2e",
            }}>{t.text}</div>
            <div style={{
              fontSize: 11, marginTop: 2,
              color: dark ? "#64748b" : "#94a3b8",
            }}>{fmtTime(t.time)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
 
// ─── Панель уведомлений ───
function NotificationPanel({ notifications, theme, onClose, onClear }) {
  const dark = theme === "dark";
  const panelRef = useRef(null);
 
  // Закрытие по клику вне панели
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
 
  return (
    <div ref={panelRef} style={{
      position: "absolute", top: 60, right: 16, zIndex: 9998,
      width: 360, maxHeight: "70vh",
      borderRadius: 16,
      background: dark ? "#12121f" : "#ffffff",
      border: `1px solid ${dark ? "#2a2a40" : "#e2e8f0"}`,
      boxShadow: dark
        ? "0 16px 48px rgba(0,0,0,0.6)"
        : "0 16px 48px rgba(0,0,0,0.12)",
      display: "flex", flexDirection: "column",
      animation: "panel-in 0.25s ease-out",
      overflow: "hidden",
    }}>
      {/* Шапка */}
      <div style={{
        padding: "14px 18px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: `1px solid ${dark ? "#2a2a40" : "#f1f5f9"}`,
      }}>
        <span style={{
          fontSize: 15, fontWeight: 700,
          color: dark ? "#e2e8f0" : "#1a1a2e",
        }}>Уведомления ({notifications.length})</span>
        <div style={{ display: "flex", gap: 8 }}>
          {notifications.length > 0 && (
            <button onClick={onClear} style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 12, color: dark ? "#64748b" : "#94a3b8",
              padding: "4px 8px", borderRadius: 6,
            }}
            onMouseEnter={e => e.target.style.color = "#ef4444"}
            onMouseLeave={e => e.target.style.color = dark ? "#64748b" : "#94a3b8"}
            >Очистить</button>
          )}
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 18, lineHeight: 1, color: dark ? "#64748b" : "#94a3b8",
            padding: "0 4px",
          }}>✕</button>
        </div>
      </div>
 
      {/* Список */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "6px 10px",
      }}>
        {notifications.length === 0 ? (
          <div style={{
            padding: 40, textAlign: "center",
            color: dark ? "#475569" : "#cbd5e1",
            fontSize: 14,
          }}>Нет уведомлений</div>
        ) : (
          notifications.map(n => (
            <div key={n.id} style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "10px 8px",
              borderRadius: 10,
              transition: "background 0.15s",
              cursor: "default",
            }}
            onMouseEnter={e => e.currentTarget.style.background = dark ? "#1e1e30" : "#f8fafc"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: n.color, marginTop: 6, flexShrink: 0,
                boxShadow: `0 0 6px ${n.color}88`,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 13, fontWeight: 500,
                  color: dark ? "#e2e8f0" : "#1e293b",
                  lineHeight: 1.4,
                }}>{n.text}</div>
                <div style={{
                  fontSize: 11, marginTop: 3,
                  color: dark ? "#475569" : "#94a3b8",
                }}>{fmtTime(n.time)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
 
// ─── Кнопка-колокольчик ───
function NotificationBell({ count, theme, onClick }) {
  const dark = theme === "dark";
  const hasNew = count > 0;
 
  return (
    <button onClick={onClick} style={{
      position: "relative",
      width: 42, height: 42, borderRadius: "50%",
      background: dark ? "#1e1e2e" : "#f1f5f9",
      border: `1px solid ${dark ? "#2a2a40" : "#e2e8f0"}`,
      cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.2s",
      boxShadow: hasNew ? `0 0 12px ${dark ? "#6366f1" : "#3b82f6"}44` : "none",
    }}
    onMouseEnter={e => {
      e.currentTarget.style.transform = "scale(1.1)";
      e.currentTarget.style.background = dark ? "#2a2a40" : "#e2e8f0";
    }}
    onMouseLeave={e => {
      e.currentTarget.style.transform = "scale(1)";
      e.currentTarget.style.background = dark ? "#1e1e2e" : "#f1f5f9";
    }}
    >
      {/* Иконка колокольчика */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke={dark ? "#e2e8f0" : "#475569"} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
 
      {/* Бейдж */}
      {hasNew && (
        <div style={{
          position: "absolute", top: -4, right: -4,
          minWidth: 18, height: 18, borderRadius: 9,
          background: "#ef4444",
          color: "#fff", fontSize: 10, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 4px",
          border: `2px solid ${dark ? "#12121f" : "#fff"}`,
        }}>{count > 99 ? "99+" : count}</div>
      )}
    </button>
  );
}
 
// ─── Собранный компонент ───
function NotificationSystem({ theme, notifications, toasts, notify, clear }) {
  const [open, setOpen] = useState(false);
 
  return (
    <>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(40px) scale(0.95); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes panel-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
 
      <NotificationBell
        count={notifications.length}
        theme={theme}
        onClick={() => setOpen(prev => !prev)}
      />
 
      {open && (
        <NotificationPanel
          notifications={notifications}
          theme={theme}
          onClose={() => setOpen(false)}
          onClear={clear}
        />
      )}
 
    </>
  );
}


// ─── Контекст ───
const NotificationContext = createContext(null);

function NotificationProvider({ children, theme }) {
  const { notifications, toasts, notify, clear } = useNotifications();

  return (
    <NotificationContext.Provider value={{ notifications, toasts, notify, clear }}>
      {children}
      <Toasts toasts={toasts} theme={theme} />
    </NotificationContext.Provider>
  );
}

// ─── Хук для любого компонента ───
function useNotify() {
  return useContext(NotificationContext);
}

export {Header, SavePanel, SavePanel2,VerifyCodeModal, ChangePasswordModal, useNotify, NotificationProvider, NotificationSystem}