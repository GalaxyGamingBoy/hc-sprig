import sys
import subprocess
import os
import glob
import shutil
import time
import threading

def log(message):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}")

def threaded_comparison(single_file, file, base_output_dir, saved_dir_base):
    output_dir = os.path.join(base_output_dir, os.path.basename(file).replace('.js', ''))
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    try:
        command = [
            "compare50",
            single_file,
            file,
            "--output", output_dir,
            "--max-file-size", "104857600",  # 100 MB
            "--passes", "text"
        ]

        log(f"Running command: {' '.join(command)}")
        subprocess.run(command, check=True)
        log("Compare50 command executed successfully.")

        match_file = os.path.join(output_dir, "match_1.html")
        if os.path.exists(match_file):
            new_filename = os.path.basename(file).replace('.js', '.html')
            saved_file_path = os.path.join(saved_dir_base, new_filename)
            log(f"Match found. Moving {match_file} to {saved_file_path}")
            shutil.move(match_file, saved_file_path)
        else:
            log(f"No match found for file: {file}")

    except subprocess.CalledProcessError as e:
        log(f"Error in running Compare50: {e}")
    except Exception as e:
        log(f"An error occurred: {e}")
    finally:
        if os.path.exists(output_dir):
            shutil.rmtree(output_dir)

def run_compare50(single_file, directory, base_output_dir, saved_dir_base):
    if not os.path.exists(saved_dir_base):
        os.makedirs(saved_dir_base)
        log("Created base directory for saved files.")

    all_js_files = [f for f in glob.glob(os.path.join(directory, "*.js")) if os.path.abspath(f) != os.path.abspath(single_file)]
    threads = []

    for file in all_js_files:
        thread = threading.Thread(target=threaded_comparison, args=(single_file, file, base_output_dir, saved_dir_base))
        threads.append(thread)
        thread.start()

    for thread in threads:
        thread.join()

    log("Plagiarism check completed.")

def main():
    if len(sys.argv) != 5:
        log("Incorrect number of arguments provided.")
        print("Usage: python plagiarism_check.py <single_file> <directory> <base_output_dir> <saved_dir_base>")
        sys.exit(1)

    single_file, directory, base_output_dir, saved_dir_base = sys.argv[1:5]
    log("Starting plagiarism check with the following arguments:")
    log(f"Single file: {single_file}")
    log(f"Directory: {directory}")
    log(f"Base output directory: {base_output_dir}")
    log(f"Saved directory base: {saved_dir_base}")

    run_compare50(single_file, directory, base_output_dir, saved_dir_base)

if __name__ == "__main__":
    main()