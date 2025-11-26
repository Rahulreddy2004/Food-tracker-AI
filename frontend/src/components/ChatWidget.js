import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { auth } from '../firebaseConfig';
import { Loader2, Send, User, Bot, X, MessageSquare } from 'lucide-react';
import './ChatWidget.css'; // Use the new CSS file

const API_URL = 'http://127.0.0.1:5000';

const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch the initial greeting message when the chat is opened
  useEffect(() => {
    // Only fetch if it's opening, we are not loading, and there are no messages
    if (isOpen && !isLoading && messages.length === 0) {
      const fetchGreeting = async () => {
        setIsLoading(true);
        try {
          const token = await auth.currentUser.getIdToken();
          const response = await axios.post(`${API_URL}/chat-with-ai`, 
            { history: [] },
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          setMessages([response.data]);
        } catch (err) {
          console.error("Error fetching greeting:", err);
          setError("Error connecting to the AI Nutritionist.");
        } finally {
          setIsLoading(false);
        }
      };
      fetchGreeting();
    }
  }, [isOpen, isLoading, messages.length]); // This effect depends on 'isOpen'

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: "user", parts: [input] };
    const newMessages = [...messages, userMessage];

    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const token = await auth.currentUser.getIdToken();
      const response = await axios.post(`${API_URL}/chat-with-ai`, 
        { history: newMessages },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      setMessages([...newMessages, response.data]);
    } catch (err) {
      console.error("Error sending message:", err);
      setError("Error getting response from AI. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    // --- This is the "Closed" state: just the floating button ---
    return (
      <button className="chat-fab" onClick={() => setIsOpen(true)}>
        <Bot size={32} /> {/* <-- 1. CHANGED ICON TO BOT */}
      </button>
    );
  }

  // --- This is the "Open" state: the full chat window ---
  return (
    <>
      <div className="chat-widget-container">
        <div className="chat-widget-header">
          <h3>AI Nutritionist</h3>
          <button className="chat-close-btn" onClick={() => setIsOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <div className="message-list">
          {messages.map((msg, index) => (
            <div key={index} className={`message-bubble ${msg.role}`}>
              <div className="message-icon">
                {msg.role === 'model' ? <Bot size={20} /> : <User size={20} />}
              </div>
              <div className="message-text">
                {msg.parts[0]}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message-bubble model">
              <div className="message-icon"><Bot size={20} /></div>
              <div className="message-text">
                <Loader2 className="spinner" size={20} />
              </div>
            </div>
          )}
          {error && <p className="error-message-chat">{error}</p>}
          <div ref={messagesEndRef} />
        </div>
        
        <form onSubmit={handleSubmit} className="chat-input-form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your diet..."
            disabled={isLoading}
          />
          <button type="submit" className="scan-button" disabled={isLoading || !input.trim()}>
            <Send size={18} />
          </button>
        </form>
      </div>
      {/* Floating button is still visible but as an "X" to close */}
      <button className="chat-fab" onClick={() => setIsOpen(false)}>
        <X size={32} />
      </button>
    </>
  );
};

export default ChatWidget;