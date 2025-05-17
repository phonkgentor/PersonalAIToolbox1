document.addEventListener('DOMContentLoaded', function() {
    // Phase 1: Scene Detection
    const sceneDetectionForm = document.getElementById('scene-detection-form');
    const animeVideoInput = document.getElementById('anime-video');
    const thresholdSelect = document.getElementById('threshold');
    const minSceneLengthSelect = document.getElementById('min-scene-length');
    const sceneJobProgress = document.getElementById('scene-job-progress');
    const sceneCurrentStep = document.getElementById('scene-current-step');
    const sceneProgressBar = document.getElementById('scene-progress-bar');
    const sceneErrorMessage = document.getElementById('scene-error-message');
    
    // Phase 2: Scene Selection
    const phase1 = document.getElementById('phase-1');
    const phase2 = document.getElementById('phase-2');
    const phase3 = document.getElementById('phase-3');
    const scenesContainer = document.getElementById('scenes-container');
    const selectAllButton = document.getElementById('select-all');
    const deselectAllButton = document.getElementById('deselect-all');
    const backToUploadButton = document.getElementById('back-to-upload');
    const createEditedVideoButton = document.getElementById('create-edited-video');
    const editYoutubeUrlInput = document.getElementById('edit-youtube-url');
    const beatSyncCheckbox = document.getElementById('beat-sync');
    const fadeAudioCheckbox = document.getElementById('fade-audio');
    const editJobProgress = document.getElementById('edit-job-progress');
    const editCurrentStep = document.getElementById('edit-current-step');
    const editProgressBar = document.getElementById('edit-progress-bar');
    const editErrorMessage = document.getElementById('edit-error-message');
    
    // Phase 3: Results
    const downloadEditedVideoButton = document.getElementById('download-edited-video');
    const startNewEditButton = document.getElementById('start-new-edit');
    
    let currentJobId = null;
    let pollingInterval = null;
    let selectedScenes = [];
    let orderedScenes = [];
    
    // Handle scene detection form submission
    sceneDetectionForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        if (!animeVideoInput.files || animeVideoInput.files.length === 0) {
            alert('Please select a video file.');
            return;
        }
        
        const videoFile = animeVideoInput.files[0];
        // Check file size (limit to 500MB to prevent request timeout issues)
        if (videoFile.size > 500 * 1024 * 1024) {
            alert('File size exceeds 500MB limit. Please choose a smaller file.');
            return;
        }
        
        const threshold = thresholdSelect.value;
        const minSceneLength = minSceneLengthSelect.value;
        
        // Create a FormData object
        const formData = new FormData();
        formData.append('video', videoFile);
        formData.append('threshold', threshold);
        formData.append('min_scene_length', minSceneLength);
        
        // Show loading state
        sceneJobProgress.classList.remove('d-none');
        sceneErrorMessage.classList.add('d-none');
        sceneCurrentStep.textContent = 'Starting scene detection...';
        sceneProgressBar.style.width = '0%';
        
        // Send the request
        fetch('/anime_editor/detect_scenes', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                currentJobId = data.job_id;
                // Start polling for status updates
                startSceneStatusPolling(currentJobId);
            } else {
                showSceneError(data.error || 'Unknown error occurred');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showSceneError('An error occurred while uploading the video. The file may be too large or the server is busy. Please try again with a smaller file.');
        });
    });
    
    // Function to start polling for scene detection status
    function startSceneStatusPolling(jobId) {
        // Clear any existing polling
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }
        
        pollingInterval = setInterval(() => {
            fetch(`/anime_editor/status/${jobId}`)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        updateSceneStatus(data.job);
                    } else {
                        showSceneError(data.error);
                        clearInterval(pollingInterval);
                    }
                })
                .catch(error => {
                    console.error('Error polling status:', error);
                    showSceneError('Failed to get status updates. Please refresh the page and try again.');
                    clearInterval(pollingInterval);
                });
        }, 2000); // Poll every 2 seconds
    }
    
    // Function to update scene detection status
    function updateSceneStatus(job) {
        sceneCurrentStep.textContent = job.current_step || 'Processing...';
        sceneProgressBar.style.width = `${job.progress || 0}%`;
        
        // Check if job is complete or has error
        if (job.status === 'scenes_detected') {
            clearInterval(pollingInterval);
            
            // Move to phase 2 (scene selection)
            setTimeout(() => {
                phase1.classList.add('d-none');
                phase2.classList.remove('d-none');
                
                // Populate scenes
                populateScenes(job.results.scenes);
            }, 1000);
        } else if (job.status === 'error') {
            clearInterval(pollingInterval);
            showSceneError(job.error || 'An error occurred during scene detection.');
        }
    }
    
    // Function to populate detected scenes
    function populateScenes(scenes) {
        scenesContainer.innerHTML = '';
        selectedScenes = [];
        orderedScenes = [];
        
        if (!scenes || scenes.length === 0) {
            scenesContainer.innerHTML = '<div class="col-12"><div class="alert alert-warning">No scenes detected. Please try with a different video or adjust detection settings.</div></div>';
            return;
        }
        
        scenes.forEach(scene => {
            const sceneCard = document.createElement('div');
            sceneCard.className = 'col-md-3 mb-4';
            sceneCard.setAttribute('draggable', true);
            sceneCard.dataset.sceneId = scene.id;
            
            // Format duration
            const duration = window.formatTimestamp(scene.duration);
            const startTime = window.formatTimestamp(scene.start_time);
            const endTime = window.formatTimestamp(scene.end_time);
            
            sceneCard.innerHTML = `
                <div class="card scene-card" data-scene-id="${scene.id}">
                    <div class="card-header bg-dark p-2 d-flex justify-content-between align-items-center">
                        <span class="badge bg-primary">Scene ${scene.id + 1}</span>
                        <span class="badge bg-secondary">${duration}</span>
                    </div>
                    <img src="/anime_editor/thumbnail/${currentJobId}/${scene.id}" class="card-img-top scene-thumbnail" alt="Scene thumbnail">
                    <div class="card-body">
                        <p class="card-text small mb-2">
                            <i class="fas fa-clock me-1"></i> ${startTime} - ${endTime}
                        </p>
                        <div class="form-check">
                            <input class="form-check-input scene-checkbox" type="checkbox" value="${scene.id}" id="scene-${scene.id}">
                            <label class="form-check-label" for="scene-${scene.id}">
                                Include in movie
                            </label>
                        </div>
                    </div>
                    <div class="card-footer bg-dark p-2 text-center">
                        <div class="scene-order badge bg-secondary d-none">1</div>
                    </div>
                </div>
            `;
            
            scenesContainer.appendChild(sceneCard);
        });
        
        // Add event listeners to scene checkboxes
        document.querySelectorAll('.scene-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                const sceneId = parseInt(this.value);
                const card = document.querySelector(`.scene-card[data-scene-id="${sceneId}"]`);
                
                if (this.checked) {
                    selectedScenes.push(sceneId);
                    if (!orderedScenes.includes(sceneId)) {
                        orderedScenes.push(sceneId);
                    }
                } else {
                    selectedScenes = selectedScenes.filter(id => id !== sceneId);
                    orderedScenes = orderedScenes.filter(id => id !== sceneId);
                }
                
                // Update UI to show which scenes are selected
                updateSelectedScenesUI();
            });
        });
        
        // Add drag and drop functionality for scene reordering
        const sceneCards = document.querySelectorAll('[draggable=true]');
        sceneCards.forEach(card => {
            card.addEventListener('dragstart', function(e) {
                e.dataTransfer.setData('text/plain', card.dataset.sceneId);
                setTimeout(() => card.classList.add('dragging'), 0);
            });
            
            card.addEventListener('dragend', function() {
                card.classList.remove('dragging');
            });
            
            card.addEventListener('dragover', function(e) {
                e.preventDefault();
            });
            
            card.addEventListener('drop', function(e) {
                e.preventDefault();
                const draggedSceneId = parseInt(e.dataTransfer.getData('text/plain'));
                const targetSceneId = parseInt(card.dataset.sceneId);
                
                if (draggedSceneId !== targetSceneId && 
                    selectedScenes.includes(draggedSceneId) && 
                    selectedScenes.includes(targetSceneId)) {
                    reorderScenes(draggedSceneId, targetSceneId);
                }
            });
        });
        
        // Add select/deselect all functionality
        if (selectAllButton) {
            selectAllButton.addEventListener('click', function() {
                document.querySelectorAll('.scene-checkbox').forEach(checkbox => {
                    checkbox.checked = true;
                    const sceneId = parseInt(checkbox.value);
                    if (!selectedScenes.includes(sceneId)) {
                        selectedScenes.push(sceneId);
                        if (!orderedScenes.includes(sceneId)) {
                            orderedScenes.push(sceneId);
                        }
                    }
                });
                updateSelectedScenesUI();
            });
        }
        
        if (deselectAllButton) {
            deselectAllButton.addEventListener('click', function() {
                document.querySelectorAll('.scene-checkbox').forEach(checkbox => {
                    checkbox.checked = false;
                });
                selectedScenes = [];
                orderedScenes = [];
                updateSelectedScenesUI();
            });
        }
    }
    
    // Function to reorder scenes
    function reorderScenes(draggedSceneId, targetSceneId) {
        // Find positions in the orderedScenes array
        const draggedIndex = orderedScenes.indexOf(draggedSceneId);
        const targetIndex = orderedScenes.indexOf(targetSceneId);
        
        if (draggedIndex !== -1 && targetIndex !== -1) {
            // Remove dragged scene from its current position
            orderedScenes.splice(draggedIndex, 1);
            
            // Insert it at the target position
            const newIndex = draggedIndex < targetIndex ? targetIndex : targetIndex;
            orderedScenes.splice(newIndex, 0, draggedSceneId);
            
            // Update UI
            updateSelectedScenesUI();
        }
    }
    
    // Function to update the UI to show which scenes are selected
    function updateSelectedScenesUI() {
        // First, mark all selected scenes
        document.querySelectorAll('.scene-card').forEach(card => {
            const sceneId = parseInt(card.dataset.sceneId);
            
            // Update selection status
            if (selectedScenes.includes(sceneId)) {
                card.classList.add('border-primary');
                card.classList.add('shadow');
            } else {
                card.classList.remove('border-primary');
                card.classList.remove('shadow');
            }
            
            // Update order numbers for selected scenes
            const orderBadge = card.querySelector('.scene-order');
            if (selectedScenes.includes(sceneId) && orderBadge) {
                const orderIndex = orderedScenes.indexOf(sceneId);
                if (orderIndex !== -1) {
                    orderBadge.textContent = orderIndex + 1;
                    orderBadge.classList.remove('d-none');
                    
                    // Add color based on position
                    orderBadge.classList.remove('bg-primary', 'bg-success', 'bg-info', 'bg-warning');
                    if (orderIndex === 0) {
                        orderBadge.classList.add('bg-primary'); // First
                    } else if (orderIndex === orderedScenes.length - 1) {
                        orderBadge.classList.add('bg-success'); // Last
                    } else if (orderIndex < orderedScenes.length / 2) {
                        orderBadge.classList.add('bg-info'); // First half
                    } else {
                        orderBadge.classList.add('bg-warning'); // Second half
                    }
                }
            } else if (orderBadge) {
                orderBadge.classList.add('d-none');
            }
        });
        
        // Enable/disable create button based on selection
        createEditedVideoButton.disabled = selectedScenes.length === 0;
        
        // Update status message
        const statusMessage = document.querySelector('#scene-selection-status');
        if (statusMessage) {
            if (selectedScenes.length === 0) {
                statusMessage.textContent = 'No scenes selected yet';
                statusMessage.className = 'badge bg-secondary';
            } else {
                statusMessage.textContent = `${selectedScenes.length} scenes selected`;
                statusMessage.className = 'badge bg-success';
            }
        }
    }
    
    // Handle back button click
    backToUploadButton.addEventListener('click', function() {
        phase2.classList.add('d-none');
        phase1.classList.remove('d-none');
        
        // Reset form
        sceneDetectionForm.reset();
        sceneJobProgress.classList.add('d-none');
    });
    
    // Handle create edited video button click
    createEditedVideoButton.addEventListener('click', function() {
        if (selectedScenes.length === 0) {
            alert('Please select at least one scene.');
            return;
        }
        
        const youtubeUrl = editYoutubeUrlInput.value.trim();
        if (!youtubeUrl) {
            alert('Please enter a YouTube URL for the background music.');
            return;
        }
        
        // Get the audio options
        const enableBeatSync = beatSyncCheckbox ? beatSyncCheckbox.checked : true;
        const enableFadeAudio = fadeAudioCheckbox ? fadeAudioCheckbox.checked : false;
        
        // Show editing progress
        editJobProgress.classList.remove('d-none');
        editErrorMessage.classList.add('d-none');
        editCurrentStep.textContent = 'Starting video editing...';
        editProgressBar.style.width = '0%';
        
        // Send the request to create edited video
        fetch('/anime_editor/edit_video', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                job_id: currentJobId,
                selected_scenes: selectedScenes,
                ordered_scenes: orderedScenes,
                music_url: youtubeUrl,
                beat_sync: enableBeatSync,
                fade_audio: enableFadeAudio
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Start polling for editing status
                startEditStatusPolling(data.job_id);
            } else {
                showEditError(data.error);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showEditError('An error occurred while starting video editing. Please try again.');
        });
    });
    
    // Function to start polling for editing status
    function startEditStatusPolling(jobId) {
        // Clear any existing polling
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }
        
        pollingInterval = setInterval(() => {
            fetch(`/anime_editor/status/${jobId}`)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        updateEditStatus(data.job);
                    } else {
                        showEditError(data.error);
                        clearInterval(pollingInterval);
                    }
                })
                .catch(error => {
                    console.error('Error polling edit status:', error);
                    showEditError('Failed to get status updates. Please refresh the page and try again.');
                    clearInterval(pollingInterval);
                });
        }, 2000); // Poll every 2 seconds
    }
    
    // Function to update editing status
    function updateEditStatus(job) {
        editCurrentStep.textContent = job.current_step || 'Processing...';
        editProgressBar.style.width = `${job.progress || 0}%`;
        
        // Check if job is complete or has error
        if (job.status === 'completed') {
            clearInterval(pollingInterval);
            
            // Move to phase 3 (results)
            setTimeout(() => {
                phase2.classList.add('d-none');
                phase3.classList.remove('d-none');
                
                // Set up download button
                downloadEditedVideoButton.onclick = () => {
                    window.location.href = `/anime_editor/download/${currentJobId}`;
                };
            }, 1000);
        } else if (job.status === 'error') {
            clearInterval(pollingInterval);
            showEditError(job.error || 'An error occurred during video editing.');
        }
    }
    
    // Handle start new edit button click
    startNewEditButton.addEventListener('click', function() {
        // Reset everything and go back to phase 1
        phase3.classList.add('d-none');
        phase1.classList.remove('d-none');
        
        // Reset forms
        sceneDetectionForm.reset();
        sceneJobProgress.classList.add('d-none');
        
        // Clear job ID and selected scenes
        currentJobId = null;
        selectedScenes = [];
    });
    
    // Helper functions for showing errors
    function showSceneError(message) {
        sceneErrorMessage.textContent = message;
        sceneErrorMessage.classList.remove('d-none');
        sceneProgressBar.classList.add('bg-danger');
    }
    
    function showEditError(message) {
        editErrorMessage.textContent = message;
        editErrorMessage.classList.remove('d-none');
        editProgressBar.classList.add('bg-danger');
    }
});
