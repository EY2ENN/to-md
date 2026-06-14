use std::process::Command;
use std::path::Path;

#[tauri::command]
async fn convert_file(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("File does not exist".to_string());
    }
    
    // Output path: same directory, same name but .md
    let parent = path.parent().unwrap_or(Path::new(""));
    let file_stem = path.file_stem().unwrap_or_default().to_string_lossy();
    
    // Create an output folder named after the file
    let output_folder = parent.join(file_stem.as_ref());
    if !output_folder.exists() {
        std::fs::create_dir_all(&output_folder).map_err(|e| e.to_string())?;
    }
    
    let out_md = output_folder.join(format!("{}.md", file_stem));
    let extract_dir = output_folder.to_string_lossy().to_string();
    
    // Write the Lua filter to a temporary file
    let filter_content = r#"
function Div(el) return el.content end
function Span(el) return el.content end
function Superscript(el)
  for _, inline in ipairs(el.content) do
    if inline.t == "Note" or inline.t == "Cite" then return el.content end
  end
end
function Subscript(el)
  for _, inline in ipairs(el.content) do
    if inline.t == "Note" or inline.t == "Cite" then return el.content end
  end
end
function RawBlock(el)
  if string.match(el.text, "^</?div") or string.match(el.text, "^</?span") then return {} end
end
function RawInline(el)
  if string.match(el.text, "^</?div") or string.match(el.text, "^</?span") then return {} end
end
"#;
    let temp_dir = std::env::temp_dir();
    let filter_path = temp_dir.join("clean_ast.lua");
    std::fs::write(&filter_path, filter_content).map_err(|e| format!("Failed to write lua filter: {}", e))?;
    
    // Run pandoc
    // pandoc input.docx -o output_folder/output.md --extract-media=output_folder
    let output = Command::new("pandoc")
        .arg(&file_path)
        .arg("-o")
        .arg(out_md.to_string_lossy().to_string())
        .arg(format!("--extract-media={}", extract_dir))
        .arg("-t")
        .arg("markdown-fenced_divs-bracketed_spans-header_attributes-link_attributes-inline_code_attributes+mark+emoji+abbreviations") // Clean markdown output
        .arg(format!("--lua-filter={}", filter_path.display()))
        .output()
        .map_err(|e| format!("Failed to run pandoc: {}", e))?;
        
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Pandoc error: {}", err_msg));
    }
    
    // Read the output markdown to return for preview
    match std::fs::read_to_string(&out_md) {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("Converted successfully but failed to read result: {}", e)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![convert_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

