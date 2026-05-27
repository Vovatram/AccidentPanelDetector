

import axios from 'axios';
import React, { useState, useEffect } from 'react';
import { VerifyCodeModal, ChangePasswordModal} from './header.jsx';
import {deleteRout,N,isValidDate,MaxIdRout,routTime,routsTime,secondsToTime,
secondsToTime2,secondsToTime3,timeToTime,calculateDelay,otheme
} from './functions.jsx';
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"  // если используешь react-router

    function MainPanel({ onLoginClick, onRegisterClick, theme}) {
      const [cod, setCod] = useState('')
      const [ATT, setATT] = useState('')
      
    
      const enterSubmit = () => {}/*axios.post(`${backurl}/views`, {fun : 'cod', numb : cod})
      .then(response => {if (response.data && response.data.includes('/')){changeUrl(response.data);}else{setATT('Такой серии не существует')}})
      .catch(error => console.error('Error find:', error));}*/
      //console.log(theme)
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className={`${theme === 'dark' ? 'bg-gray-800 bg-opacity-80' : 'bg-white bg-opacity-90'} p-8 rounded-lg shadow-lg w-full max-w-md`}>
            <h2 className="text-2xl font-bold text-center mb-6">Добро пожаловать</h2>
            <div className="mb-4">
              <input
                type="text"
                placeholder="Введите имя"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onChange={(e) => setCod(e.target.value)}
                onKeyDown={(e) => {if (e.key === 'Enter') {enterSubmit()}}}
                value = {cod}
              />
            </div>
            <p style = {{color:"red"}}>{ATT}</p>
            <button className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition mb-4"
                onClick={enterSubmit}>
              
              Вперёд
            </button>
            <div className="flex justify-between gap-4">
              <button
                onClick={onLoginClick}
                className="w-1/2 bg-gray-300 text-gray-800 py-2 rounded-lg hover:bg-gray-400 transition"
              >
                Вход
              </button>
              <button
                onClick={onRegisterClick}
                className="w-1/2 bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 transition"
              >
                Регистрация
              </button>
            </div>
          </div>
        </div>
      );
    }

    function LoginModalPanel({ onClose, theme}) {
      axios.defaults.withCredentials = true
        const [ATT1, setATT1] = React.useState('');
        const [email, setEmail] = React.useState('');
        const [password, setPassword] = React.useState('');
        const [LocalDict] = useState({})
        const navigate = useNavigate();

        const enterSubmit = async () => {
            let res = await axios.post(`${import.meta.env.VITE_API_URL}/login`, {
            email: email,     // для OAuth2PasswordRequestForm это поле называется username
            password: password})
            res = res.data
            console.log(res)
            if(res.error){setATT1(res.error)}
            else{localStorage.setItem('access_token', res.access_token);window.accessToken = res.access_token; navigate('/' + res.url)}
        }/*            
            axios.post(`${backurl}/test`, [{ task: 'test', base : 'base', email: email, pass: password}])
            .then(response => {console.log(response.data);
                if (response.data[0]['Status'] === 'N'){setATT1(response.data[0]['Text'])}
                else{window.location.assign(response.data[0]['data'])}
                })
            .catch(error => console.error('Error updating todo:', error));}*/
            /*
      const enterSubmit = () => {axios.post(`${backurl}/views`, {fun : 'log', pass : password, email: email}, {withCredentials: true}, {credentials: "include"})
            .then(response => {if (response.data.includes('/')){changeUrl(response.data);}else{setATT1(response.data)}})
            .catch(error => console.error('Error find:', error));}*/

        
        
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            className={`${theme === 'dark' ? 'bg-gray-800 bg-opacity-80' : 'bg-white bg-opacity-90'} p-8 rounded-lg shadow-lg w-full max-w-md`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-center mb-6">Вход</h2>
            <div className="mb-4">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="Электронная почта"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="mb-4">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="Пароль"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p style = {{color:"red"}}>{ATT1}</p>
            </div>
            <a style={{display: 'flex',flexDirection: 'row-reverse',color: '#0070ff'}} 
            onClick={() => {LocalDict.email = email; LocalDict.CodePanel = true}}>Забыли пароль?</a>
            <div className="flex justify-between gap-4">
              <button
                onClick={onClose}
                className="w-1/2 bg-gray-300 text-gray-800 py-2 rounded-lg hover:bg-gray-400 transition"
              >
                Закрыть
              </button>
              <button className="w-1/2 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition"
                onClick={enterSubmit}>
                Войти
              </button>
            </div>
          </div>
          {LocalDict.CodePanel && <VerifyCodeModal email = {LocalDict.email} Next = {() => {LocalDict.PasswordPanel = true}} theme = {theme} Close = {() => {LocalDict.CodePanel = false }}/>}
          {LocalDict.PasswordPanel && <ChangePasswordModal data = {LocalDict.email} Next = {'СОХРАНИТЬ ПАРОЛЬ'} theme = {theme} Close = {() => {LocalDict.PasswordPanel = false }}/>}
        </div>
      );
    }



function RegisterPanel({ onSubmit, theme }) {
        
      const [name, setName] = useState('');
      const [email, setEmail] = React.useState('');
      const [password, setPassword] = React.useState('');
      const [confirmPassword, setConfirmPassword] = React.useState('');

      
      const [ATT1, setATT1] = React.useState('');
      const [ATT2, setATT2] = React.useState('');
      
    
    
      useEffect(() => {
        const checkEmail = async () => {
            if (!email || !email.includes('@')) {
            setATT1('Недопустимая почта');
            return;
            }

            const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/check-email`, {
                params: { email },});
            if(data.available === 'Некорректная почта'){
                setATT1('Некорректная почта');
            }else if (!data.available) {
                setATT1('Почта уже занята');
            } else {
                setATT1('');
            }}
        if (password !== confirmPassword) {
          setATT2('Пароли не совпадают!');
        }else if (password === ''){
            setATT2('Недопустимый пароль');
        }else{
            setATT2('');
        }

        if (name === ''){setATT1('Недопустимое имя');}
        else{checkEmail()}/*
            
            axios.post(`${backurl}/views`, {fun : 'tsk', task: 'check', tip: 'email', email: email}, {withCredentials: true}, {credentials: "include"})
            .then(response => {if (response.data){setATT1('Email адрес занят')}else{setATT1('')} console.log(response.data)})
            .catch(error => console.error('Error find:', error));*/

      },  [name, password, email, confirmPassword])
      
      const handleSubmit = async () => {
        if (ATT2 === '' && ATT1 === '') {
            const generateCode = () => {return Math.floor(100000 + Math.random() * 900000).toString();};
            const code = generateCode()
            const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/send-email`, {params: { email, code},})
            console.log(`Код ${code} отправлен на ${email}`);
            onSubmit({ name, email, password, code})
        }}




      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            className={`${theme === 'dark' ? 'bg-gray-800 bg-opacity-80' : 'bg-white bg-opacity-90'} p-8 rounded-lg shadow-lg w-full max-w-md`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-center mb-6">Регистрация</h2>
            <div className="mb-4">
              <input
                type="text"
                placeholder="Имя"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="mb-4">
              <input
                type="email"
                placeholder="Электронная почта"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p style={{color:"red"}}>{ATT1}</p>
            </div>
            <div className="mb-4">
              <input
                type="password"
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="mb-4">
              <input
                type="password"
                placeholder="Повторите пароль"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p style = {{color:"red"}}>{ATT2}</p>
            </div>
            <div className="flex justify-between gap-4">
              <button
                onClick={() => onSubmit(null)}
                className="w-1/2 bg-gray-300 text-gray-800 py-2 rounded-lg hover:bg-gray-400 transition"
              >
                Закрыть
              </button>
              <button
                onClick={handleSubmit}
                className="w-1/2 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition"
              >
                Зарегистрироваться
              </button>
            </div>
          </div>
        </div>
      );
    }

    function CodeVerificationPanel({ email, name, verificationCode, onVerify, onClose, password, theme}) {
      const [code, setCode] = React.useState('');
      const handleVerify = async () => {
        if (code === verificationCode) {
            const res = await axios.post(`${import.meta.env.VITE_API_URL}/register`, {name: name, email: email, password : password})
            onVerify(true)/*
            axios.post(`${backurl}/views`, {fun : 'tsk', task: 'new', name: name, email: email, pass : password}, {withCredentials: true}, {credentials: "include"})
            .then(response => {})
            .catch(error => console.error('Error updating todo:', error))*/
        } else {
          alert('Неверный код!');
        }
      };

      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            className={`${theme === 'dark' ? 'bg-gray-800 bg-opacity-80' : 'bg-white bg-opacity-90'} p-8 rounded-lg shadow-lg w-full max-w-md`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-center mb-6">Подтверждение кода</h2>
            <p className="text-center mb-4">Код отправлен на {email}</p>
            <div className="mb-4">
              <input
                type="text"
                placeholder="Введите 6-значный код"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-between gap-4">
              <button
                onClick={onClose}
                className="w-1/2 bg-gray-300 text-gray-800 py-2 rounded-lg hover:bg-gray-400 transition"
              >
                Закрыть
              </button>
              <button
                onClick={handleVerify}
                className="w-1/2 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition"
              >
                Подтвердить
              </button>
            </div>
          </div>
        </div>
      );
    }

    function SuccessPanel({ onClose, theme }) {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            className={`${theme === 'dark' ? 'bg-gray-800 bg-opacity-80' : 'bg-white bg-opacity-90'} p-8 rounded-lg shadow-lg w-full max-w-md`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-center mb-6">Успех!</h2>
            <p className="text-center mb-4">Вы успешно зарегистрировались!</p>
            <div className="flex justify-center">
              <button
                onClick={onClose}
                className="bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      );
    }

    function Enter({param}) {
      const [showLogin, setShowLogin] = React.useState(false);
      const [showRegister, setShowRegister] = React.useState(false);
      const [showCodeVerification, setShowCodeVerification] = React.useState(false);
      const [showSuccess, setShowSuccess] = React.useState(false);
      const [verificationCode, setVerificationCode] = React.useState('');
      const [email, setEmail] = React.useState('');
      const [name, setName] = React.useState('');
      const [password, setPassword] = React.useState('');
      const [theme, setTheme] = useState(otheme(param.theme));
      useEffect(() => {setTheme(otheme(param.theme))}, [param.theme])

      const generateCode = () => {
        return Math.floor(100000 + Math.random() * 900000).toString();
      };

      const handleRegisterSubmit = (data) => {
        if (!data) {
          setShowRegister(false);
          return;
        }
        setVerificationCode(data.code);
        setEmail(data.email);
        setName(data.name);
        setPassword(data.password);
        setShowRegister(false);
        setShowCodeVerification(true);
      }

      const handleCodeVerify = (isValid) => {
        if (isValid) {
          setShowCodeVerification(false);
          setShowSuccess(true);
        }
      };

      return (
        <div className={` ${theme === 'dark' ? 'bg-gradient-to-br from-indigo-900 via-blue-900 to-purple-900 text-white' : 'bg-gradient-to-br from-gray-100 via-gray-200 to-white text-gray-900'}`}>

          <MainPanel theme = {theme}
            onLoginClick={() => setShowLogin(true)}
            onRegisterClick={() => setShowRegister(true)}
          />
          {showLogin && <LoginModalPanel onClose={() => setShowLogin(false)} theme = {theme} />}
          {showRegister && <RegisterPanel onSubmit={handleRegisterSubmit} theme = {theme} />}
          {showCodeVerification && (
            <CodeVerificationPanel
             theme = {theme}
              password={password}
              email={email}
              name={name}
              verificationCode={verificationCode}
              onVerify={handleCodeVerify}
              onClose={() => setShowCodeVerification(false)}
            />
          )}
          {showSuccess && <SuccessPanel onClose={() => setShowSuccess(false)} />}
        </div>
      );
    }
export default Enter;