document.addEventListener('DOMContentLoaded', function() {
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');
    const clearChatButton = document.getElementById('clear-chat');
    
    // Generate a session ID for this chat
    let sessionId = localStorage.getItem('chat_session_id');
    if (!sessionId) {
        sessionId = window.generateUUID();
        localStorage.setItem('chat_session_id', sessionId);
    }
    
    // Load chat history
    loadChatHistory();
    
    // Submit message
    chatForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const message = chatInput.value.trim();
        if (message) {
            sendMessage(message);
            chatInput.value = '';
        }
    });
    
    // Clear chat history
    clearChatButton.addEventListener('click', function() {
        clearChat();
    });
    
    // Function to load chat history
    function loadChatHistory() {
        fetch(`/chat/history?session_id=${sessionId}`)
            .then(response => response.json())
            .then(data => {
                if (data.success && data.history.length > 0) {
                    chatMessages.innerHTML = ''; // Clear the chat container
                    data.history.forEach(message => {
                        appendMessage(message.role, message.content);
                    });
                    // Scroll to bottom of chat
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            })
            .catch(error => {
                console.error('Error loading chat history:', error);
            });
    }
    
    // Function to send message to the server
    function sendMessage(message) {
        // Add user message to the chat
        appendMessage('user', message);
        
        // Show typing indicator
        const typingIndicator = document.createElement('div');
        typingIndicator.id = 'typing-indicator';
        typingIndicator.className = 'message-row assistant-message';
        typingIndicator.innerHTML = `
            <div class="message-bubble">
                <div class="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
        chatMessages.appendChild(typingIndicator);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Send request to server
        fetch('/chat/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                session_id: sessionId
            }),
        })
        .then(response => response.json())
        .then(data => {
            // Remove typing indicator
            const indicator = document.getElementById('typing-indicator');
            if (indicator) {
                indicator.remove();
            }
            
            if (data.success) {
                // Add AI response to the chat
                appendMessage('assistant', data.message);
            } else {
                // Display error message
                appendMessage('system', `Error: ${data.error}`);
            }
            
            // Scroll to bottom of chat
            chatMessages.scrollTop = chatMessages.scrollHeight;
        })
        .catch(error => {
            // Remove typing indicator
            const indicator = document.getElementById('typing-indicator');
            if (indicator) {
                indicator.remove();
            }
            
            // Display error message
            appendMessage('system', `Error: ${error.message}`);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
    }
    
    // Function to append a message to the chat
    function appendMessage(role, content) {
        const messageRow = document.createElement('div');
        messageRow.className = `message-row ${role}-message`;
        
        // Format content
        let formattedContent = content;
        
        // Check for code blocks with syntax highlighting
        if (content.includes('```')) {
            formattedContent = formatCodeBlocks(content);
        }
        
        // Set icon based on role
        let icon = '';
        if (role === 'user') {
            icon = '<i class="fas fa-user"></i>';
        } else if (role === 'assistant') {
            icon = '<i class="fas fa-robot"></i>';
        } else {
            icon = '<i class="fas fa-exclamation-triangle"></i>';
        }
        
        messageRow.innerHTML = `
            <div class="message-icon">${icon}</div>
            <div class="message-bubble">
                <div class="message-content">${formattedContent}</div>
            </div>
        `;
        
        chatMessages.appendChild(messageRow);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Function to format code blocks
    function formatCodeBlocks(content) {
        // Split the content by code block markers
        const parts = content.split(/```([a-zA-Z]*)\n/);
        let formattedContent = '';
        let insideCodeBlock = false;
        let language = '';
        
        for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 0) {
                // Regular text content (outside code blocks)
                formattedContent += parts[i].replace(/\n/g, '<br>');
            } else {
                // Language identifier
                language = parts[i] || 'plaintext';
                
                // The next part is the code block content
                i++;
                if (i < parts.length) {
                    const codeContent = parts[i].replace(/```\n$/, '').replace(/```$/, '');
                    formattedContent += `<pre><code class="language-${language}">${codeContent}</code></pre>`;
                }
            }
        }
        
        return formattedContent;
    }
    
    // Function to clear chat
    function clearChat() {
        fetch('/chat/clear', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                session_id: sessionId
            }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                chatMessages.innerHTML = `
                    <div class="text-center text-muted my-5">
                        <i class="fas fa-robot fa-3x mb-3"></i>
                        <p>Start a conversation with the AI assistant.</p>
                    </div>
                `;
            }
        })
        .catch(error => {
            console.error('Error clearing chat:', error);
        });
    }
});
