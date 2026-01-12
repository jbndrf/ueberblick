import { supabaseClient } from '../core/supabase.js';
import participantAuth from '../auth/participant-auth.js';

class ImageUploadService {
    constructor() {
        this.maxFileSize = 10 * 1024 * 1024; // 10MB (matches bucket limit)
        this.allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
        this.version = 'v2.0-fixed'; // Debug version identifier
        console.log('ImageUploadService initialized -', this.version);
    }

    /**
     * Upload image file to Supabase Storage
     */
    async uploadImage(file, instanceId, fieldId) {
        console.log('=== ImageUploadService.uploadImage called ===');
        console.log('Version:', this.version);
        console.log('Parameters:', { fileName: file.name, instanceId, fieldId });
        
        // 1. Validate file
        if (!this.validateFile(file)) {
            throw new Error('Invalid file type or size');
        }

        // 2. Get participant context
        const authStatus = participantAuth.getAuthStatus();
        if (!authStatus.isAuthenticated) {
            throw new Error('Not authenticated');
        }

        // Get project ID from the correct location
        let projectId = authStatus.project?.id || 'default';
        
        // Ensure we never use 'undefined' as projectId
        if (projectId === 'undefined' || !projectId) {
            console.warn('No valid project ID found, using default');
            projectId = 'default';
        }
        
        const participantId = authStatus.participant.id;
        
        // 3. Compress image if needed
        const compressedFile = await this.compressImage(file);

        // 4. Generate unique filename
        const fileExt = file.name.split('.').pop();
        const timestamp = Date.now();
        const filename = `${fieldId}_${timestamp}.${fileExt}`;

        // 5. Construct storage path (MUST match RLS policy)
        // For initial form submissions without instance, use 'temp' as instanceId
        const actualInstanceId = instanceId || 'temp';
        const storagePath = `${projectId}/${actualInstanceId}/${filename}`;

        // 6. Convert File to ArrayBuffer for upload (fix Supabase Storage issue)
        const fileBuffer = await compressedFile.arrayBuffer();
        
        console.log('Uploading file:', {
            storagePath,
            fileName: compressedFile.name,
            fileType: compressedFile.type,
            fileSize: compressedFile.size,
            bufferSize: fileBuffer.byteLength
        });
        
        const { data, error } = await supabaseClient.client.storage
            .from('participant-images')
            .upload(storagePath, fileBuffer, {
                cacheControl: '3600',
                upsert: false,
                contentType: compressedFile.type
            });
            
        console.log('Upload response:', { data, error });

        if (error) {
            throw new Error(`Upload failed: ${error.message}`);
        }

        // Log file upload audit if instanceId is available
        if (instanceId) {
            try {
                await supabaseClient.logFileOperationAudit(instanceId, 'file_upload', {
                    fileName: compressedFile.name,
                    filePath: storagePath,
                    fileSize: compressedFile.size,
                    fileType: compressedFile.type
                }, {
                    activityType: 'file_operation',
                    activitySummary: `Uploaded file: ${compressedFile.name}`,
                    activityDetails: {
                        operation: 'file_upload',
                        component: 'image-upload-service',
                        originalSize: fileBuffer.byteLength,
                        compressedSize: compressedFile.size
                    }
                });
            } catch (auditError) {
                console.warn('Failed to log file upload audit:', auditError);
            }
        }

        // 7. Return file URL for storage in database
        const { data: urlData } = supabaseClient.client.storage
            .from('participant-images')
            .getPublicUrl(storagePath);

        return {
            path: storagePath,
            url: urlData.publicUrl,
            filename: filename,
            size: compressedFile.size,
            isTemporary: !instanceId // Flag to indicate if this is a temporary upload
        };
    }

    /**
     * Move temporary files to final instance location
     */
    async moveTemporaryFiles(tempPaths, finalInstanceId) {
        const movedFiles = [];
        
        for (const tempPath of tempPaths) {
            try {
                // Parse temp path: project-id/temp/filename
                const pathParts = tempPath.split('/');
                if (pathParts.length !== 3 || pathParts[1] !== 'temp') {
                    continue; // Skip non-temp files
                }
                
                const projectId = pathParts[0];
                const filename = pathParts[2];
                const finalPath = `${projectId}/${finalInstanceId}/${filename}`;
                
                // Move file from temp to final location
                const { data, error } = await supabaseClient.client.storage
                    .from('participant-images')
                    .move(tempPath, finalPath);
                
                if (error) {
                    console.warn(`Failed to move temp file ${tempPath}:`, error);
                    continue;
                }
                
                movedFiles.push({
                    oldPath: tempPath,
                    newPath: finalPath,
                    url: this.getImageUrl(finalPath)
                });
                
            } catch (error) {
                console.warn(`Error moving temp file ${tempPath}:`, error);
            }
        }
        
        return movedFiles;
    }

    /**
     * Clean up temporary files that are no longer needed
     */
    async cleanupTemporaryFiles(olderThanMinutes = 60) {
        try {
            const { data: files, error } = await supabaseClient.client.storage
                .from('participant-images')
                .list('', {
                    limit: 1000,
                    search: 'temp/'
                });

            if (error) {
                console.warn('Failed to list temp files for cleanup:', error);
                return;
            }

            const cutoffTime = Date.now() - (olderThanMinutes * 60 * 1000);
            const filesToDelete = [];

            for (const file of files) {
                // Extract timestamp from filename
                const match = file.name.match(/_(\d+)\./);
                if (match) {
                    const timestamp = parseInt(match[1]);
                    if (timestamp < cutoffTime) {
                        filesToDelete.push(file.name);
                    }
                }
            }

            if (filesToDelete.length > 0) {
                const { error: deleteError } = await supabaseClient.client.storage
                    .from('participant-images')
                    .remove(filesToDelete);

                if (deleteError) {
                    console.warn('Failed to cleanup temp files:', deleteError);
                } else {
                    console.log(`Cleaned up ${filesToDelete.length} temporary files`);
                }
            }
        } catch (error) {
            console.error('Temp file cleanup failed:', error);
        }
    }

    /**
     * Fix malformed storage structure (remove UUID subdirectories)
     * This is a one-time cleanup utility for the weird Supabase behavior
     */
    async fixMalformedStorage() {
        try {
            console.log('Starting comprehensive storage structure cleanup...');
            
            let fixedCount = 0;
            
            // Function to recursively find and fix malformed files
            const fixPath = async (basePath = '') => {
                const { data: items, error } = await supabaseClient.client.storage
                    .from('participant-images')
                    .list(basePath, {
                        limit: 1000
                    });

                if (error) {
                    console.warn(`Failed to list items in ${basePath}:`, error);
                    return;
                }

                for (const item of items) {
                    const fullPath = basePath ? `${basePath}/${item.name}` : item.name;
                    
                    if (item.metadata && item.metadata.size) {
                        // This is a file - check if it's in a malformed location
                        console.log(`Found file: ${fullPath} (${item.metadata.size} bytes)`);
                        
                        // Check if this file is nested incorrectly (has .jpg/.png in the path but not at the end)
                        const pathParts = fullPath.split('/');
                        let foundImageExtension = false;
                        let imageExtensionIndex = -1;
                        
                        for (let i = 0; i < pathParts.length - 1; i++) {
                            const part = pathParts[i];
                            if (part.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                                foundImageExtension = true;
                                imageExtensionIndex = i;
                                break;
                            }
                        }
                        
                        if (foundImageExtension) {
                            // This file is in a malformed location - fix it
                            const actualFilename = pathParts[imageExtensionIndex];
                            const projectPart = pathParts[0] === 'undefined' ? 'default' : pathParts[0];
                            const instancePart = pathParts[1] || 'temp';
                            
                            const correctPath = `${projectPart}/${instancePart}/${actualFilename}`;
                            
                            try {
                                // Download the malformed file
                                const { data: fileData, error: downloadError } = await supabaseClient.client.storage
                                    .from('participant-images')
                                    .download(fullPath);
                                
                                if (downloadError) {
                                    console.warn(`Failed to download ${fullPath}:`, downloadError);
                                    continue;
                                }
                                
                                // Convert to ArrayBuffer if needed
                                const fileBuffer = fileData instanceof ArrayBuffer ? fileData : await fileData.arrayBuffer();
                                
                                // Re-upload with correct structure
                                const { error: uploadError } = await supabaseClient.client.storage
                                    .from('participant-images')
                                    .upload(correctPath, fileBuffer, {
                                        cacheControl: '3600',
                                        upsert: true,
                                        contentType: this.getContentType(actualFilename)
                                    });
                                
                                if (uploadError) {
                                    console.warn(`Failed to re-upload ${correctPath}:`, uploadError);
                                    continue;
                                }
                                
                                // Remove the malformed file/directory structure
                                await supabaseClient.client.storage
                                    .from('participant-images')
                                    .remove([fullPath]);
                                
                                fixedCount++;
                                console.log(`Fixed: ${fullPath} -> ${correctPath}`);
                                
                            } catch (fileError) {
                                console.warn(`Failed to fix file ${fullPath}:`, fileError);
                            }
                        }
                    } else {
                        // This is a directory - recurse into it
                        await fixPath(fullPath);
                    }
                }
            };
            
            await fixPath();
            console.log(`Storage cleanup completed. Fixed ${fixedCount} files.`);
            
        } catch (error) {
            console.error('Storage cleanup failed:', error);
        }
    }

    /**
     * Get content type from filename
     */
    getContentType(filename) {
        const ext = filename.toLowerCase().split('.').pop();
        switch (ext) {
            case 'jpg':
            case 'jpeg': return 'image/jpeg';
            case 'png': return 'image/png';
            case 'gif': return 'image/gif';
            case 'webp': return 'image/webp';
            default: return 'image/jpeg';
        }
    }

    /**
     * Get image URL for display
     */
    getImageUrl(storagePath) {
        if (!storagePath) {
            console.warn('ImageUploadService: Empty storage path provided');
            return null;
        }

        // Clean up common malformed paths
        let cleanPath = storagePath;
        
        // Handle Windows file paths (C:\fakepath\...)
        if (cleanPath.includes('C:\\fakepath\\')) {
            console.warn('ImageUploadService: Invalid Windows fakepath detected:', cleanPath);
            return null;
        }
        
        // Handle undefined project paths
        if (cleanPath.startsWith('undefined/')) {
            console.warn('ImageUploadService: Invalid undefined project path detected:', cleanPath);
            return null;
        }

        // For public buckets, construct the URL directly to avoid RLS authentication issues
        const directPublicUrl = `http://192.168.1.91:8000/storage/v1/object/public/participant-images/${cleanPath}`;
        
        console.log('ImageUploadService: Using direct public URL approach:', {
            storagePath: cleanPath,
            directUrl: directPublicUrl
        });
        
        // Test the URL to make sure it works
        fetch(directPublicUrl, { method: 'HEAD' })
            .then(response => {
                console.log('ImageUploadService: Direct URL test result:', {
                    url: directPublicUrl,
                    status: response.status,
                    ok: response.ok
                });
            })
            .catch(error => {
                console.warn('ImageUploadService: Direct URL test failed:', {
                    url: directPublicUrl,
                    error: error.message
                });
            });
        
        return directPublicUrl;
    }

    /**
     * Delete image from storage with audit logging
     */
    async deleteImage(storagePath, instanceId = null) {
        const { error } = await supabaseClient.client.storage
            .from('participant-images')
            .remove([storagePath]);

        if (error) {
            throw new Error(`Delete failed: ${error.message}`);
        }

        // Log file deletion audit if instanceId is available
        if (instanceId) {
            try {
                await supabaseClient.logFileOperationAudit(instanceId, 'file_delete', {
                    filePath: storagePath,
                    fileName: storagePath.split('/').pop()
                }, {
                    activityType: 'file_operation',
                    activitySummary: `Deleted file: ${storagePath.split('/').pop()}`,
                    activityDetails: {
                        operation: 'file_delete',
                        component: 'image-upload-service'
                    }
                });
            } catch (auditError) {
                console.warn('Failed to log file deletion audit:', auditError);
            }
        }
    }

    /**
     * Validate file type and size
     */
    validateFile(file) {
        if (!file) return false;
        
        // Check file type
        if (!this.allowedTypes.includes(file.type)) {
            return false;
        }
        
        // Check file size
        if (file.size > this.maxFileSize) {
            return false;
        }
        
        return true;
    }

    /**
     * Compress image if too large (reuse legacy compression logic)
     */
    async compressImage(file) {
        const maxSize = 2 * 1024 * 1024; // 2MB trigger for compression
        
        if (file.size <= maxSize) {
            return file;
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            
            reader.onload = function(event) {
                const img = new Image();
                img.src = event.target.result;
                
                img.onload = function() {
                    // Calculate dimensions (max 1600x1600)
                    let { width, height } = img;
                    const MAX_DIM = 1600;
                    
                    if (width > height) {
                        if (width > MAX_DIM) {
                            height *= MAX_DIM / width;
                            width = MAX_DIM;
                        }
                    } else {
                        if (height > MAX_DIM) {
                            width *= MAX_DIM / height;
                            height = MAX_DIM;
                        }
                    }
                    
                    // Create canvas and compress
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    canvas.toBlob((blob) => {
                        if (blob) {
                            const compressedFile = new File([blob], file.name, {
                                type: file.type,
                                lastModified: file.lastModified
                            });
                            resolve(compressedFile);
                        } else {
                            reject(new Error('Compression failed'));
                        }
                    }, file.type, 0.8); // 80% quality
                };
            };
            
            reader.onerror = () => reject(new Error('File read failed'));
        });
    }
}

export const imageUploadService = new ImageUploadService();

// DEBUG: Add test function to window for manual testing
window.testUpload = async function(file) {
    console.log('=== MANUAL TEST UPLOAD ===');
    console.log('File:', file);
    
    try {
        const result = await imageUploadService.uploadImage(file, null, 'test');
        console.log('Upload successful:', result);
        return result;
    } catch (error) {
        console.error('Upload failed:', error);
        throw error;
    }
};

// DEBUG: Add direct storage test
window.testDirectUpload = async function(file) {
    console.log('=== DIRECT STORAGE TEST ===');
    
    // Import supabase client
    const { supabaseClient } = await import('../core/supabase.js');
    
    // Create simple test blob
    const testBlob = new Blob(['test data'], { type: 'text/plain' });
    const testPath = `debug/test_${Date.now()}.txt`;
    
    console.log('Testing with simple blob:', { testPath, blobSize: testBlob.size });
    
    try {
        const { data, error } = await supabaseClient.client.storage
            .from('participant-images')
            .upload(testPath, testBlob, {
                cacheControl: '3600',
                upsert: false
            });
            
        console.log('Direct blob upload result:', { data, error });
        
        // Now test with the actual file as ArrayBuffer
        const fileBuffer = await file.arrayBuffer();
        const filePath = `debug/file_${Date.now()}.png`;
        
        console.log('Testing with file ArrayBuffer:', { filePath, bufferSize: fileBuffer.byteLength });
        
        const { data: fileData, error: fileError } = await supabaseClient.client.storage
            .from('participant-images')
            .upload(filePath, fileBuffer, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type
            });
            
        console.log('Direct file upload result:', { fileData, fileError });
        
        return { blobResult: { data, error }, fileResult: { fileData, fileError } };
    } catch (error) {
        console.error('Direct upload test failed:', error);
        throw error;
    }
};