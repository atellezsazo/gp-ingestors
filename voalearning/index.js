'use strict';

const libingester = require('libingester');
const url = require('url');

const BASE_URI = 'https://learningenglish.voanews.com/';
const PAGE_LINKS = 'https://learningenglish.voanews.com/z/4729';

const AUDIO_QUALITY = '128 kbps'; // ['64 kbps', '128 kbps']
const IMAGE_QUALITY = 'w800';
const VIDEO_QUALITY = '360p'; // ['270p', '360p', '720p', '1080p']
const VIDEO_THUMB_QUALITY = 'w650';

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.BlogArticle();
        const metadata = JSON.parse($('script[type="application/ld+json"]').text());
        const date = new Date(metadata.dateModified);
        const body = $('.wsw').first().attr('id', 'mybody');
        const main_video = $('.player-and-links video').first();
        const uri_thumb = $('meta[property="og:image"]').attr('content');
        const read_more = 'Read more at www.learningenglish.voanews.com';
        const title = metadata.name;

        // finding first wrapp; "elem": Object Cheerio; "id_main_tag": String
        const find_first_wrapp = (elem, id_main_tag) => {
            let current = elem;
            let parent = $(current).parent()[0];
            while (parent) {
                const attr = parent.attribs || {};
                if (attr.id == id_main_tag) {
                    return current;
                } else {
                    current = parent;
                    parent = $(current).parent()[0];
                }
            }
        }

        // function for save image asset: return ImageAsset
        const save_image_asset = (image_asset, img_title) => {
            image_asset.set_title(img_title);
            hatch.save_asset(image_asset);
            return image_asset;
        }

        // function for download image (source String): return ImageAsset
        const download_image = (src, img_title) => {
            if (src) {
                const image = libingester.util.download_image(src);
                return save_image_asset(image, img_title);
            }
        }

        // function for download image (Cheerio Object): return ImageAsset
        const download_img = ($img, img_title) => {
            if ($img[0]) {
                const image = libingester.util.download_img($img);
                return save_image_asset(image, img_title);
            }
        }

        // fix the image, add figure and figcaption
        const fix_img_with_figure = (replace, src, alt, search_caption, find_caption) => {
            if (src && replace) {
                if (!alt) alt = ''; // set default alt
                let figure = $(`<figure><img src="${src}" alt="${alt}"></img></figure>`);
                let caption = [];
                // finding figcaption by search_caption or callback function (find_caption)
                if (find_caption) {
                    caption = find_caption();
                } else if (search_caption) {
                    caption = $(replace).find(search_caption).first();
                }
                // if found.. add to figure
                if (caption[0]) {
                    figure.append(`<figcaption><p>${caption.html()}</p></figcaption>`);
                }
                // replace and return
                $(replace).replaceWith(figure);
                return figure;
            } else {
                $(replace).remove();
            }
        }

        // return a Objecto with metadata video
        const get_metadata_video = (elem, $video_tag) => {
            let video_meta = {
                thumb_uri: $video_tag.attr('poster').replace('w250', VIDEO_THUMB_QUALITY),
                video_title: $(elem).find('img').attr('title') || title,
            };

            const data_sources = JSON.parse($video_tag.attr('data-sources'));
            const default_download_uri = $video_tag.attr('src');
            let download_uri = default_download_uri;

            for (const source of data_sources) {
                if (source.DataInfo == VIDEO_QUALITY) download_uri = source.Src;
            }

            video_meta['download_uri'] = download_uri;
            return video_meta;
        }

        // download video and fix the body
        const save_video = (elem, $video_tag) => {
            const meta = get_metadata_video(elem, $video_tag);

            const video_thumb = download_image(meta.thumb_uri, meta.video_title);
            const video = libingester.util.get_embedded_video_asset($(elem), meta.download_uri);
            video.set_thumbnail(video_thumb);
            video.set_title(meta.video_title);
            hatch.save_asset(video);
        }

        // download audio and fix the body
        const save_audio = (elem, $audio_tag) => {
            const audio = new libingester.VideoAsset();
            const default_download_uri = $audio_tag.attr('src');
            const data_sources = JSON.parse($audio_tag.attr('data-sources'));
            const audio_title = $(elem).find('.html5Player').first().attr('data-title') || title;
            let download_uri = default_download_uri;
            if (data_sources[0].DataInfo == AUDIO_QUALITY) download_uri = data_sources[0].Src;

            audio.set_download_uri(download_uri);
            audio.set_last_modified_date(new Date());
            audio.set_title(audio_title);
            hatch.save_asset(audio);

            $(elem).replaceWith(`<audio data-libingester-asset-id=${audio.asset_id}><source /></audio>`);
        }

        // download image and fix the body
        const save_image = (elem, $image_tag) => {
            const src = $image_tag.attr('src').replace('w250', IMAGE_QUALITY);
            const alt = $image_tag.attr('alt');
            const figure = fix_img_with_figure(elem, src, alt, '.caption');
            download_img($(figure.children()[0]), title);
        }

        // process embed links and fix the body
        const process_embed = (elem, $embed) => {
            const embed_uri = url.resolve(BASE_URI, $embed.attr('data-src'));
            const link_tag = $(elem).find('a').first();
            link_tag.attr('target', '_blank').attr('href', embed_uri);

            const img = $(elem).find('img').first();
            if (img[0]) { // if found img, it is a Quiz
                const src = img.attr('src').replace('w250', IMAGE_QUALITY);
                const alt = img.attr('alt');

                const link = link_tag.clone().text('Start Quiz');
                const start_quiz = $(`<p></p>`).append(link);
                start_quiz.insertBefore(elem);

                const figure = fix_img_with_figure(elem, src, alt, '.caption');
                download_img($(figure.children()[0]));
            } else {
                const link = link_tag.clone();
                link.text(link.text());
                link_tag.replaceWith($(`<h3></h3>`).append(link));
            }
        }

        // clean body
        body.find('style, iframe, script, noscript').remove();

        // download media and process embed
        body.find('.wsw__embed').map((i,elem) => {
            const $audio_tag = $(elem).find('audio').first();
            const $image_tag = $(elem).find('img').first();
            const $video_tag = $(elem).find('video').first();
            const $embed = $(elem).find('.flexible-iframe').first();

            if ($embed[0]) {
                process_embed(elem, $embed);
            } else if ($video_tag[0]) {
                save_video(elem, $video_tag);
            } else if ($audio_tag[0]){
                save_audio(elem, $audio_tag);
            } else if ($image_tag[0]) {
                save_image(elem, $image_tag);
            } else {
                console.log('Removed');
            }
        });

        // donwload lost Images
        body.find('img').map((i,elem) => {
            const wrapp = find_first_wrapp(elem, body.attr('id'));
            if (elem.attribs.src) {
                const src = $(elem).attr('src').replace('w250', IMAGE_QUALITY);
                const alt = $(elem).attr('alt');
                const figure = fix_img_with_figure(wrapp, src, alt, undefined, () => {
                    for (const content of $(elem).parent().contents().get()) {
                        if (content.type == 'text' && $(content).text().trim() != '') {
                            return $(`<p>${$(content).text()}</p>`);
                        }
                    }
                });
                download_img($(figure.children()[0]), title);
            }
        });

        // extract contents on div's
        const extract_divs = (div = body.find('div').first()) => {
            if (div[0]) {
                div.contents().map((i,elem) => $(elem).insertBefore(div));
                div.remove();
                convert_divs();
                extract_divs(body.find('div').first());
            }
        }

        // convert main divs to 'p'
        const convert_divs = () => {
            body.contents().filter((i,elem) => elem.name == 'div').map((i,div) => {
                if (!$(div).find('div, p, h2').first()[0]) div.name = 'p';
            });
        }

        // fixed all 'divs'
        convert_divs();
        extract_divs();

        // fix paragraphs
        body.find('p').map((i,elem) => {
            const text = $(elem).text().trim();
            const html = $(elem).html();
            if (text === '' || html == '&#x200B;') {
                $(elem).remove(); // remove empty paragraphs
            } else if (text.includes('_________') || text == '_') {
                $(elem).replaceWith('<hr>'); // convert 'p' to 'hr'
            }
        });

        // convert 'h2>strong' to 'h2'
        body.find('h2>strong').map((i,elem) => {
            const parent = $(elem).parent();
            const text = $(elem).text();
            if (parent.text().trim() == text.trim()) parent.replaceWith(`<h2>${text}</h2>`);
        });

        // fix malformed links
        body.find('a').map((i,elem) => {
            const href = $(elem).attr('href');
            if (href) {
                const index = href.lastIndexOf('http');
                if (index > 0) $(elem).attr('href', href.substring(index));
            }
        });

        // fixing some tags
        body.find('p>figure').map((i,elem) => $(elem).insertAfter($(elem).parent()));
        body.find('p>video, p>audio').map((i,elem) => $(elem).insertBefore($(elem).parent()));
        body.find('p>p').map((i,elem) => {
            const parent = $(elem).parent();
            if (parent.text().trim() == $(elem).text().trim()) parent.replaceWith(elem);
        });
        body.find('p').filter((i,p) => $(p).text().trim() == '').remove();
        body.find('br').remove();

        // return True if tag is a delimiter
        const delimiters = ['h1','h2','p','figure','h3','hr', 'video', 'audio'];
        const is_delimiter = (tag) => {
            for (const delimit of delimiters) if (tag.name == delimit) return true;
        }

        // wrapp lost text with 'p'
        let lost_p = $('<p></p>');
        body.contents().filter((i,elem) => {
            if (is_delimiter(elem)) {
                const children = lost_p.children();
                const text = lost_p.text().trim();
                if (children[0] && text !== '') {
                    lost_p.clone().insertBefore(elem);
                    lost_p = $('<p></p>');
                }
            } else {
                lost_p.append($(elem).clone());
                $(elem).remove();
            }
        })

        // append 'main video' to the body and set thumbnail
        const video_meta = get_metadata_video(undefined, main_video);
        const main_image = download_image(video_meta.thumb_uri, video_meta.title);
        const video = new libingester.VideoAsset();
        video.set_title(video_meta.title);
        video.set_last_modified_date(new Date());
        video.set_thumbnail(main_image);
        asset.set_thumbnail(main_image);
        hatch.save_asset(video);
        body.prepend(`<video data-libingester-asset-id=${video.asset_id}><source /></video>`);

        // article settings
        asset.set_canonical_uri(uri);
        asset.set_author(metadata.author.name);
        asset.set_body(body);
        asset.set_tags(metadata.keywords.split(','));
        asset.set_title(metadata.name);
        asset.set_synopsis(metadata.description);
        asset.set_date_published(date);
        asset.set_last_modified_date(date);
        asset.set_read_more_text(read_more);
        asset.set_custom_scss(`
            $primary-light-color: #212121;
            $primary-medium-color: #000000;
            $primary-dark-color: #212121;
            $accent-light-color: #F5018F;
            $accent-dark-color: #890050;
            $background-light-color: #FDFDFD;
            $background-dark-color: #EFEFEF;
            $title-font: 'Noto Serif';
            $body-font: 'Noto Sans UI';
            $display-font: 'Noto Sans UI';
            $logo-font: 'Noto Sans UI';
            $context-font: 'Noto Sans UI';
            $support-font: 'Noto Sans UI';
            @import '_default';
        `);

        console.log('processing', title);
        asset.render();
        hatch.save_asset(asset);
    }).catch(err => {
        console.log(uri, err);
    })
}

function ingest_video(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.VideoAsset();
        const description = $('meta[property="og:description"]').attr('content');
        const download_uri = $('video[data-type="video/mp4"]').attr('src');
        const modified_date = $('span.date time').attr('datetime');
        const title = $('meta[property="og:title"]').attr('content');
        const uri_thumb = $('meta[property="og:image"]').attr('content');

        // download thumbnail
        const thumb = libingester.util.download_image(uri_thumb);
        thumb.set_title(title);

        // video settings
        asset.set_canonical_uri(uri);
        asset.set_download_uri(download_uri);
        asset.set_last_modified_date(new Date(Date.parse(modified_date)));
        asset.set_synopsis(description);
        asset.set_thumbnail(thumb);
        asset.set_title(title);

        //save assets
        hatch.save_asset(thumb);
        hatch.save_asset(asset);
    });
}

function main() {
    const hatch = new libingester.Hatch('learning-english-voa', 'en');

    // ingest_article(hatch, 'https://learningenglish.voanews.com/a/lets-learn-english-lesson-22/3397314.html')
    //     .then(() => hatch.finish())

    libingester.util.fetch_html(PAGE_LINKS).then($ => {
        const links = $('#content').find('.img-wrap').get().map(a => url.resolve(BASE_URI, a.attribs.href));
        return Promise.all(links.map(uri => ingest_article(hatch, uri)))
            .then(() => hatch.finish());
    }).catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
