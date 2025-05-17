document.addEventListener('DOMContentLoaded', function() {
    const amvForm = document.getElementById('amv-form');
    const videoFileInput = document.getElementById('video-file');
    const youtubeUrlInput = document.getElementById('youtube-url');
    const amvJobProgress = document.getElementById('amv-job-progress');
    const amvCurrentStep = document.getElementById('amv-current-step');
    const amvProgressBar = document.getElementById('amv-progress-bar');
    const amvErrorMessage = document.getElementById('amv-error-message');
    const amvResultsEmpty = document.getElementById('amv-results-empty');
    const amvResultsContent = document.getElementById('amv-results-content');
    const download3minButton = document.getElementById('download-3min-amv');
    const download1minButton = document.getElementById('download-1min-amv');
    
    let currentJobId = null;
    let pollingInterval = null;
    
    // Handle form submission
    amvForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        if (!videoFileInput.files || videoFileInput.files.length === 0) {
            alert('Please select a video file.');
            return;
        }
        
        const videoFile = videoFileInput.files[0];
        const youtubeUrl = youtubeUrlInput.value.trim();
        
        if (!youtubeUrl) {
            alert('Please enter a YouTube URL for the background music.');
            return;
        }
        
        // Create a FormData object
        const formData = new FormData();
        formData.append('video', videoFile);
        formData.append('music_url', youtubeUrl);
        
        // Show loading state
        amvJobProgress.classList.remove('d-none');
        amvResultsEmpty.classList.add('d-none');
        amvResultsContent.classList.add('d-none');
        amvErrorMessage.classList.add('d-none');
        amvCurrentStep.textContent = 'Starting AMV generation...';
        amvProgressBar.style.width = '0%';
        
        // Send the request
        fetch('/amv_generator/generate', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                currentJobId = data.job_id;
                // Start polling for status updates
                startStatusPolling(currentJobId);
            } else {
                showError(data.error);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showError('An error occurred while starting the AMV generation. Please try again.');
        });
    });
    
    // Function to start polling for status updates
    function startStatusPolling(jobId) {
        // Clear any existing polling
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }
        
        pollingInterval = setInterval(() => {
            fetch(`/amv_generator/status/${jobId}`)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        updateJobStatus(data.job);
                    } else {
                        showError(data.error);
                        clearInterval(pollingInterval);
                    }
                })
                .catch(error => {
                    console.error('Error polling status:', error);
                    showError('Failed to get status updates. Please refresh the page and try again.');
                    clearInterval(pollingInterval);
                });
        }, 2000); // Poll every 2 seconds
    }
    
    // Function to update job status display
    function updateJobStatus(job) {
        amvCurrentStep.textContent = job.current_step || 'Processing...';
        amvProgressBar.style.width = `${job.progress || 0}%`;
        
        // Check if job is complete or has error
        if (job.status === 'completed') {
            clearInterval(pollingInterval);
            amvJobProgress.classList.add('d-none');
            amvResultsContent.classList.remove('d-none');
            amvResultsEmpty.classList.add('d-none');
            
            // Enable download buttons
            download3minButton.disabled = false;
            download1minButton.disabled = false;
            
            // Add click handlers for download buttons
            download3minButton.onclick = () => {
                window.location.href = `/amv_generator/download/${job.id}/three_min`;
            };
            
            download1minButton.onclick = () => {
                window.location.href = `/amv_generator/download/${job.id}/one_min`;
            };
        } else if (job.status === 'error') {
            clearInterval(pollingInterval);
            showError(job.error || 'An error occurred during AMV generation.');
        }
    }
    
    // Function to show error
    function showError(message) {
        amvErrorMessage.textContent = message;
        amvErrorMessage.classList.remove('d-none');
        amvProgressBar.classList.add('bg-danger');
    }
});
